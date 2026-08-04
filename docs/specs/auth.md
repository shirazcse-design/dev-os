# Spec: Authentication & Session Management

Implements PRD Component A / FR-01 / US-001.

## User Flow

1. **Sign up:** Visitor on `/` clicks "Get Started Free" → navigates to `/sign-up` → submits email + password → Supabase Auth creates the user → session cookie set → redirect to `/dashboard`.
2. **Sign in:** Visitor navigates to `/sign-in` → submits credentials → Supabase Auth validates → session cookie set → redirect to `/dashboard`.
3. **Sign out:** Authenticated user clicks "Sign Out" in the header → Supabase Auth session cleared → redirect to `/`.
4. **Session persistence:** Every page under `(dashboard)` is server-rendered behind a session check; an expired/missing session redirects to `/sign-in?redirect={originalPath}`.

## DB Schema

No custom table. Uses Supabase's built-in `auth.users`. Every app table (`contracts`, `chat_sessions`, `user_feedback`, `rate_limits`) has a `user_id uuid references auth.users(id)` column — see `docs/specs/supabase-schema.sql`.

## DB Tasks

- None (no SQL to run beyond the base schema's FK references to `auth.users`).
- **Manual dashboard step (not SQL):** In the Supabase Dashboard → Authentication → Providers, ensure "Email" provider is enabled with "Confirm email" per your launch requirements (PRD assumes email/password only, no OAuth at MVP).

## API Routes

None custom. All auth operations go directly through the Supabase JS SDK from the frontend:

```ts
// lib/supabase/client.ts (browser client)
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

```ts
// lib/supabase/server.ts (server client for Route Handlers + Server Components)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

Every Route Handler in every other spec begins with:

```ts
const supabase = await createClient()
const { data: { user }, error } = await supabase.auth.getUser()
if (error || !user) {
  return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }, { status: 401 })
}
```

## State Management

- No TanStack Query — auth state comes directly from the Supabase client's `onAuthStateChange` listener, wrapped in a `useSession()` hook:

```ts
// hooks/useSession.ts
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Session } from '@supabase/supabase-js'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return { session, loading }
}
```

## Component Spec

- `app/(auth)/sign-up/page.tsx` — email input, password input (min 8 chars, client-validated), submit button, link to `/sign-in`. On submit: `supabase.auth.signUp({ email, password })`.
- `app/(auth)/sign-in/page.tsx` — email input, password input, submit button, link to `/sign-up`. On submit: `supabase.auth.signInWithPassword({ email, password })`.
- `components/shared/Header.tsx` — shows "Sign Out" when `session` is present; calls `supabase.auth.signOut()` then redirects to `/`.
- Both auth forms must complete their flow (submit → redirect) within 10 seconds (PRD constraint) — no artificial delay, network-bound only.

## Design

Form and button styles come from `docs/design.md`'s input/button component specs. Error text uses the design system's semantic "error" color token, never a hardcoded red.

## Edge Cases

- Duplicate email on sign-up → Supabase returns `error.message` containing "already registered" → UI shows: "An account with this email already exists. Try signing in instead."
- Invalid credentials on sign-in → generic message: "Invalid email or password." (do not reveal which field was wrong).
- Password < 8 characters → blocked client-side before any network call.
- Session expires while on a dashboard page → next Route Handler call returns `401` → frontend interceptor redirects to `/sign-in?redirect=<current-path>`, and after successful sign-in the user is sent back to that path.
- Network failure during auth call → generic "Something went wrong. Please try again." with a retry button (do not surface raw Supabase error internals).

## Acceptance Criteria

- [ ] (US-001) Submitting a valid sign-up form creates a Supabase Auth user, sets a session cookie, and redirects to `/dashboard` in ≤ 10s under normal network conditions.
- [ ] (US-001) Submitting valid sign-in credentials authenticates and redirects to `/dashboard` in ≤ 10s.
- [ ] Sign-up with an email that already has an account shows "An account with this email already exists. Try signing in instead." and does not create a duplicate user.
- [ ] Sign-in with wrong password or unregistered email shows the identical generic message "Invalid email or password." in both cases (no user-enumeration signal).
- [ ] Password field rejects < 8 characters client-side; no `POST` to Supabase Auth is made until the client-side check passes.
- [ ] Every route under `(dashboard)` redirects an unauthenticated visitor to `/sign-in?redirect={originalPath}`, and signing in from that redirect returns the user to `{originalPath}`, not `/dashboard`.
- [ ] Clicking "Sign Out" clears the session and redirects to `/`; a subsequent direct navigation to `/dashboard` redirects back to `/sign-in`.
- [ ] `auth.users` is the only user store — no custom `users`/`profiles` table is created at MVP.
- [ ] RLS is verified with an integration test: a second authenticated user cannot read the first user's `contracts` row via `GET /api/contracts/{id}` (expect `404`, not `403`, to avoid confirming existence).
