# Spec: API Infrastructure (Rate Limiting, Retries, Error Handling)

Cross-cutting infrastructure shared by every OpenAI-calling route (`/api/extract`, `/api/chat`) and every Route Handler in general. Not a standalone PRD component — implements the reliability constraints in PRD §5 ("OpenAI API errors must be caught and surfaced with a human-readable message and retry option — no silent failures") and the External Dependencies risk mitigations in PRD §3.

## Standard Error Shape

Every Route Handler returns errors in this exact shape, via shared helpers in `lib/api/errors.ts`:

```ts
// lib/api/errors.ts
import { NextResponse } from 'next/server'

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

export const unauthorized = () => errorResponse(401, 'UNAUTHORIZED', 'Sign in required')
export const badRequest = (code: string, message: string) => errorResponse(400, code, message)
export const notFound = (code: string, message: string) => errorResponse(404, code, message)
export const conflict = (code: string, message: string) => errorResponse(409, code, message)
export const unprocessable = (code: string, message: string) => errorResponse(422, code, message)
export const tooManyRequests = (code: string, message: string) => errorResponse(429, code, message)
export const badGateway = (code: string, message: string) => errorResponse(502, code, message)
export const serverError = (code: string, message: string) => errorResponse(500, code, message)
```

Frontend maps known `error.code` values (`SCANNED_PDF`, `TOKEN_LIMIT_EXCEEDED`, `RATE_LIMITED`, `OPENAI_UNAVAILABLE`, etc.) to specific, human-readable copy; any unrecognized code falls back to a generic "Something went wrong. Please try again." — never surfaces raw error internals to the user.

## Retry with Exponential Backoff

```ts
// lib/openai/withRetry.ts
export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        const delayMs = 2 ** attempt * 500 // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }
  throw lastError
}
```

Applied uniformly around every `openai.chat.completions.create()` call in `lib/prompts/extraction.ts` and `lib/prompts/chat.ts`. On final exhaustion, the calling route sets `contracts.status = 'error'` (extraction) or returns `502` with the user message already persisted (chat) — never a silent failure, per PRD constraint.

## Rate Limiting

DB-backed counters using the `rate_limits` table (see `docs/specs/supabase-schema.sql`), scoped per user per route per rolling hour window. Chosen over an external rate-limiter (e.g. Upstash Redis) to keep the architecture within the single-Supabase-project design.

```ts
// lib/api/rateLimit.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export async function checkAndIncrementRateLimit(
  supabase: SupabaseClient,
  userId: string,
  route: 'extract' | 'chat',
  limit: number
): Promise<boolean> {
  const windowStart = new Date()
  windowStart.setMinutes(0, 0, 0) // current hour bucket

  const { data: existing } = await supabase
    .from('rate_limits')
    .select('request_count')
    .eq('user_id', userId)
    .eq('route', route)
    .eq('window_start', windowStart.toISOString())
    .maybeSingle()

  if (existing && existing.request_count >= limit) {
    return false
  }

  await supabase
    .from('rate_limits')
    .upsert(
      {
        user_id: userId,
        route,
        window_start: windowStart.toISOString(),
        request_count: (existing?.request_count ?? 0) + 1,
      },
      { onConflict: 'user_id,route,window_start' }
    )

  return true
}
```

Limits are configured via `.env` (`RATE_LIMIT_EXTRACT_PER_HOUR`, `RATE_LIMIT_CHAT_PER_HOUR` — see `.env.example`), not hardcoded, so they can be tuned post-launch without a code change.

## Request Validation

Every Route Handler validates its request body against a Zod schema before doing any work, in `lib/validation/schemas.ts`:

```ts
import { z } from 'zod'

export const extractRequestSchema = z.object({
  contract_id: z.string().uuid(),
  custom_terms: z.array(z.string().min(1).max(100)).max(5).optional().default([]),
})

export const chatRequestSchema = z.object({
  session_id: z.string().uuid().nullable(),
  contract_id: z.string().uuid(),
  message: z.string().min(1).max(2000),
})

export const termUpdateSchema = z.object({
  value: z.string().min(1).max(2000),
})

export const feedbackRequestSchema = z.object({
  contract_id: z.string().uuid(),
  rating: z.enum(['up', 'down']),
  comment: z.string().max(1000).nullable().optional(),
})
```

Each route parses with `.safeParse()` and returns `badRequest('VALIDATION_ERROR', result.error.message)` on failure, before touching the database or OpenAI.

## Edge Cases

- Two requests from the same user in the same hour window race on the `rate_limits` upsert → the `upsert` with `onConflict` is not atomic against a true race (read-then-write); acceptable at MVP scale (PRD targets 100 concurrent analyses, not per-user concurrent extraction bursts) — revisit with a Postgres function using `for update` locking if abuse is observed post-launch.
- OpenAI returns a `429` (their own rate limit, not ours) → `withRetry` treats it identically to any other transient failure — backs off and retries up to 3 times.
- A Route Handler throws an unexpected (non-OpenAI, non-validation) error → caught by a top-level try/catch per route, logged server-side, returns generic `serverError('INTERNAL_ERROR', 'Something went wrong.')` — no stack traces or internals ever reach the client.

## Acceptance Criteria

- [ ] Every Route Handler response — success and error — matches its documented shape exactly; error responses always follow `{ error: { code, message } }`.
- [ ] A transient OpenAI failure (simulated 500/timeout) is retried up to 3 times with exponential backoff (~1s, 2s, 4s) before the calling route treats it as exhausted.
- [ ] A user who has made `RATE_LIMIT_EXTRACT_PER_HOUR` (or `RATE_LIMIT_CHAT_PER_HOUR`) requests in the current hour window receives `429 RATE_LIMITED` on the next request to that route, without an OpenAI call being made.
- [ ] Rate-limit windows reset on the hour boundary (new `window_start`), not on a rolling 60-minute basis from the user's first request.
- [ ] Every request body is validated against its Zod schema before any DB or OpenAI call; a validation failure returns `400 VALIDATION_ERROR` with no side effects.
- [ ] No unhandled exception in any Route Handler ever reaches the client as a raw stack trace or unstructured 500 — all are caught and normalized to the standard error shape.
