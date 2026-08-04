# Spec: Feedback Collection

Implements PRD Component H / FR-12 / US-010.

## User Flow

1. On the results page (`/contracts/[id]`), a small feedback widget is always visible near the disclaimer: thumbs up / thumbs down toggle + optional comment field.
2. User selects a rating (and optionally types a comment) → clicks "Submit" → `POST /api/feedback`.
3. Submit button disables immediately on click (prevents double-submit) and shows a brief "Thanks for the feedback" confirmation on success.

## DB Schema

`user_feedback` — see `docs/specs/supabase-schema.sql`.

## DB Tasks

- Insert one row per submission: `{ contract_id, user_id, rating, comment }`. No update path at MVP — a user may submit multiple feedback entries for the same contract if they choose to (not deduplicated; PRD does not specify a one-per-contract constraint).

## API Routes

### `POST /api/feedback`
- **Auth:** Required; `contract_id` must belong to the caller.
- **Request:**
```json
{ "contract_id": "uuid", "rating": "up", "comment": "Missed the auto-renewal clause on page 3" }
```
- **Response `201`:** `{ "feedback_id": "uuid" }`
- **Validation:** `rating` must be `"up"` or `"down"`; `comment` optional, max 1000 chars.
- **Errors:** `404` (`CONTRACT_NOT_FOUND`), `400` (`INVALID_RATING`).

**Handler logic (`app/api/feedback/route.ts`):**
```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { contract_id, rating, comment } = await req.json()
  if (!['up', 'down'].includes(rating)) return badRequest('INVALID_RATING', 'rating must be "up" or "down".')
  if (comment && comment.length > 1000) return badRequest('INVALID_COMMENT', 'Comment must be under 1000 characters.')

  const { data: contract } = await supabase
    .from('contracts')
    .select('id')
    .eq('id', contract_id)
    .eq('user_id', user.id)
    .single()
  if (!contract) return notFound('CONTRACT_NOT_FOUND', 'Contract not found.')

  const { data, error } = await supabase
    .from('user_feedback')
    .insert({ contract_id, user_id: user.id, rating, comment: comment ?? null })
    .select('id')
    .single()
  if (error) return serverError('DB_WRITE_FAILED', error.message)

  return NextResponse.json({ feedback_id: data.id }, { status: 201 })
}
```

## State Management

- Local component state only (`useState` for selected rating + comment draft) — no TanStack Query cache needed for the widget itself; a TanStack Query mutation wraps the submit call purely for loading/error state.

## Component Spec

- `components/results/FeedbackWidget.tsx` — thumbs up/down toggle buttons (mutually exclusive selection), optional `<textarea>` for comment, "Submit" button disabled until a rating is selected and disabled again immediately on click.

## Design

Uses standard button/input tokens from `docs/design.md`; thumbs icons from the design system's documented icon library.

## Edge Cases

- Submit with no comment → `comment: null`, allowed.
- Double-click submit → button is disabled synchronously on the first click's `onClick` handler, before the async request even starts.
- Network failure on submit → inline error, button re-enabled so the user can retry.

## Acceptance Criteria

- [ ] (US-010) Selecting a thumbs rating and clicking Submit persists a `user_feedback` row with the correct `contract_id`, `user_id`, and `rating`, and shows a confirmation message.
- [ ] Submitting without a comment succeeds with `comment: null`; submitting with a comment over 1000 characters is rejected client-side before any request is sent.
- [ ] Two rapid clicks on Submit result in exactly one `POST /api/feedback` request (no duplicate submissions).
- [ ] Feedback submitted for a contract the user does not own is rejected with `404 CONTRACT_NOT_FOUND` (ownership enforced server-side, not just hidden in the UI).
