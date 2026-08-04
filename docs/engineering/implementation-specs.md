# ContractIQ — Implementation Specs

**Status:** Draft — awaiting approval
**Companion to:** `docs/engineering/engineering-doc.md`

Each block below covers one MVP feature component (per PRD §3 Component A–H) at the level of detail needed to start Stage 2 (`/implementation-specs`, which will expand these into granular, runnable spec files plus `supabase-schema.sql` and `.env.example`).

---

## A — User Authentication & Session Management

**User flow:** See engineering-doc.md §4.1–4.2 (Sign Up → Dashboard, Sign In → Dashboard).

**DB schema:** Uses Supabase's built-in `auth.users` table — no custom `users` table at MVP (no extra profile fields required by the PRD). All app tables FK to `auth.users.id`.

**DB tasks:**
- Enable email/password provider in Supabase Auth settings (dashboard config, not SQL).
- No custom triggers needed unless a `profiles` table is introduced later (not required for MVP scope).

**API routes:** None custom — Supabase Auth JS SDK (`signUp`, `signInWithPassword`, `signOut`) called directly from the frontend via `lib/supabase/client.ts`; session persisted via `@supabase/ssr` cookies so Route Handlers can read it server-side.

**State management:** Supabase session is the source of truth; TanStack Query is not used for auth state. A thin `useSession()` hook wraps the Supabase client's `onAuthStateChange` listener.

**Component spec:**
- `app/(auth)/sign-up/page.tsx` — email/password form, client-side validation (email format, password ≥ 8 chars), inline error on failed submit.
- `app/(auth)/sign-in/page.tsx` — same shape, "invalid credentials" error surfaced from Supabase's error response.
- Both redirect to `/dashboard` on success.

**Design:** Follows `docs/design.md` form/input/button component specs (regenerate for ContractIQ branding before Stage 4 — currently a stale placeholder doc).

**Edge cases:**
- Duplicate email on sign-up → Supabase returns a specific error code; surface "An account with this email already exists."
- Session expiry mid-session → Route Handlers return `401`; frontend redirects to sign-in preserving the intended destination.
- Auth flow must complete within 10s (PRD constraint) — no client-side retries needed since Supabase Auth is synchronous per call.

---

## B — PDF Upload & Text Extraction

**User flow:** See engineering-doc.md §4.3 step 1.

**DB schema:** `contracts` table (full schema in engineering-doc.md §7).

**DB tasks:**
- Insert `contracts` row on successful upload + extraction (`status = 'uploaded'`).
- Non-blocking Storage upload — if it fails, `file_path` stays `null`; `contract_text` is still populated so the pipeline is unaffected.

**API routes:** `POST /api/contracts` (full spec in engineering-doc.md §9).

**State management:** TanStack Query mutation (`useUploadContract`) drives the upload; Zustand `uploadWizardStore` tracks the current wizard step (`select-type → upload → preview → processing`) client-side only.

**Component spec:**
- `components/upload/UploadDropzone.tsx` — drag-and-drop + file picker, client-side pre-validation (MIME type, size) before hitting the API, shows upload progress.
- Contract-type dropdown (NDA/MSA) gates which standard term list is shown in the preview.

**Design:** Dropzone and progress indicator per `docs/design.md` component patterns (badges/data rows apply to the term preview list).

**Edge cases:**
- File > 10MB or wrong MIME type → rejected client-side with inline error before any network call.
- Extracted word count < 100 → `422 SCANNED_PDF` → UI shows "Scanned PDFs are not supported yet."
- Token estimate > 15,000 → `422 TOKEN_LIMIT_EXCEEDED` → UI shows "This contract is too long for MVP processing."
- Storage upload fails but text extraction succeeds → contract still usable via text-viewer fallback (FR-06); no error shown to user, just a quieter "PDF preview unavailable" note.

---

## C — Key Term Extraction via OpenAI

**User flow:** See engineering-doc.md §4.3 step 3.

**DB schema:** `key_terms`, `custom_key_terms`, `rate_limits` tables (engineering-doc.md §7).

**DB tasks:**
- Insert one `key_terms` row per extracted term (standard + custom) on successful extraction.
- Update `contracts.status` through `processing → completed | error`.
- Atomic increment on `rate_limits` before each OpenAI call.

**API routes:** `POST /api/extract` (full spec in engineering-doc.md §9).

**State management:** TanStack Query mutation (`useExtractContract`), with the results page polling `useContractDetail` (short interval) while `status = 'processing'`, switching to a normal cache-backed fetch once `completed`.

**Component spec:**
- Progress indicator (3 steps: extracting text → analysing with AI → compiling results) driven by `contracts.status`.
- `components/results/KeyTermsPanel.tsx` renders the returned term array once available.

**Design:** Confidence colour-coding (green ≥80%, amber 50–79%, red <50%) must map to named tokens in `docs/design.md`, never hardcoded hex.

**Edge cases:**
- OpenAI JSON parse failure → one automatic retry with the corrective prompt; second failure → `status = 'error'`.
- OpenAI timeout/outage → 3-retry exponential backoff, then `status = 'error'` + "Try again in a few minutes" CTA; contract remains re-triggerable without re-upload.
- Rate limit exceeded → `429`, UI shows a cooldown message.
- Confidence < 50% on any term → term still shown (never hidden) with ⚠️ + tooltip.

---

## D — Custom Term Addition

**User flow:** See engineering-doc.md §4.3 steps 2–3.

**DB schema:** `custom_key_terms` table records requested term names pre-processing; resulting values land in `key_terms` with `is_custom = true`.

**DB tasks:** Insert into `custom_key_terms` at extraction time (alongside the `key_terms` insert), capped at 5 rows per contract (app-enforced, matching PRD's context-length constraint).

**API routes:** Custom terms are submitted as part of `POST /api/extract`'s request body (`custom_terms: string[]`), not a separate endpoint.

**State management:** Zustand `uploadWizardStore` holds draft custom terms before submission (add/remove/edit in the wizard); no DB write until "Process Contract" is clicked.

**Component spec:**
- `components/upload/CustomTermInput.tsx` — "+ Add Key Term" button, text input, "Custom" badge in the preview list, disabled past 5 terms.

**Design:** "Custom" badge uses the same badge component pattern as standard-term rows, differentiated by a token-based accent, not a one-off color.

**Edge cases:**
- User attempts a 6th custom term → input disabled, tooltip explains the 5-term cap.
- Custom term name overlaps a standard term (e.g., user re-types "Governing Law") → allowed; extraction will simply produce two entries — acceptable per PRD (no dedup logic specified).

---

## E — Results Display (PDF Viewer + Key Terms Panel)

**User flow:** See engineering-doc.md §4.3 steps 4–5, 7 (correction), 8 (low-confidence highlight).

**DB schema:** Reads `contracts` (for `contract_text`, `file_path`), `key_terms`.

**DB tasks:** `PATCH /api/terms/{id}` updates `key_terms.value`, sets `edited = true`, preserves `original_value`, inserts a `term_corrections` row.

**API routes:** `GET /api/contracts/{id}`, `PATCH /api/terms/{id}` (full specs in engineering-doc.md §9).

**State management:** TanStack Query (`useContractDetail`, `useKeyTermMutation` with optimistic update + rollback on failure); Zustand `viewerStore` for PDF zoom/current-page (ephemeral, not persisted).

**Component spec:**
- `components/results/PdfViewer.tsx` — PDF.js wrapper, accepts a `targetPage` prop that both key-term clicks and chat citations can set to trigger smooth-scroll + highlight.
- `components/results/TextViewerFallback.tsx` — parses `[PAGE N]` markers from `contract_text`, renders labelled page sections, responds to the same `targetPage` prop (FR-06 parity requirement).
- `components/results/KeyTermRow.tsx` — click-to-edit inline, "Why?" expandable showing `source_sentence`, "Edited" badge when `edited = true`.

**Design:** Two-panel layout on desktop, tabbed on mobile, per `docs/design.md` layout/grid patterns; "Not legal advice" disclaimer banner present on every results page render (`components/shared/Disclaimer.tsx`).

**Edge cases:**
- `file_path` is null (Storage upload failed) → render `TextViewerFallback` automatically, no user-facing error.
- Edit save fails (network) → optimistic UI rolls back, inline error shown; must otherwise complete within 2s (PRD constraint).
- Term with confidence < 50% → PDF viewer auto-highlights the nearest matching page span on term click.

---

## F — Contract Chat (Q&A)

**User flow:** See engineering-doc.md §4.4.

**DB schema:** `chat_sessions`, `chat_messages`.

**DB tasks:** Create a `chat_sessions` row on first message per contract; insert a `chat_messages` row for both the user message and the assistant response per turn.

**API routes:** `POST /api/chat`, `GET /api/chat/{session_id}/messages` (full specs in engineering-doc.md §9).

**State management:** TanStack Query for message history (`useChatMessages`), with a Supabase Realtime subscription on `chat_messages` inserts for the active session pushing new rows into the query cache (covers latency between the send and the assistant's persisted reply). Zustand holds the chat input draft only.

**Component spec:**
- `components/chat/ChatPanel.tsx` — message list (`aria-live` region for new messages), input box, send button (disabled while awaiting response).
- `components/chat/ChatMessage.tsx` — right-aligned (user) / left-aligned (assistant), assistant messages render the `[Page X]` citation as a clickable link that sets `PdfViewer`'s `targetPage`.

**Design:** Chat bubble styling and spacing per `docs/design.md` component patterns; floating action button or sidebar tab per PRD's stated UI options — sidebar tab chosen for consistency with the two-panel results layout (avoids an overlapping floating element on smaller viewports).

**Edge cases:**
- Response latency > 15s P95 target — UI shows a "still thinking" indicator past ~8s.
- OpenAI failure mid-chat → user message is still persisted (not lost); assistant row omitted; UI offers "Retry" without re-typing the question.
- Off-document question (hallucination test case) → model must respond "I cannot find this in the document" — covered by the mandatory Playwright regression test in engineering-doc.md §13.
- Reopening a contract's results page must restore the full prior session (US-012) — handled by `useChatMessages` fetching on mount, not requiring a fresh empty session.

---

## G — Dashboard & History

**User flow:** See engineering-doc.md §4.2.

**DB schema:** Reads `contracts` only (aggregation queries — no new tables).

**DB tasks:** None beyond the standard `contracts` indexes (`(user_id, created_at desc)`, `(user_id, status)`) already specified for query performance.

**API routes:** `GET /api/contracts` (list + summary mode — full spec in engineering-doc.md §9).

**State management:** TanStack Query (`useContracts`) with query-param-driven sort/order state (kept in the URL, not Zustand, so sort state is shareable/bookmarkable).

**Component spec:**
- `components/dashboard/SummaryCards.tsx` — total contracts, breakdown by type.
- `components/dashboard/ContractTable.tsx` — sortable columns (date, name, type), row click navigates to `contracts/[id]`, status badge (uploaded/processing/completed/error).

**Design:** Table/row patterns per `docs/design.md` "data row" component spec.

**Edge cases:**
- Zero contracts → empty state (see §4.1).
- A contract in `status = 'error'` appears in the list with a distinct badge and a "Retry" affordance that re-triggers `/api/extract` without re-uploading.

---

## H — Feedback Collection

**User flow:** Thumbs up/down + optional comment on the results page, submitted independently of the review flow (no PRD flow diagram — a simple, always-available widget).

**DB schema:** `user_feedback` table (engineering-doc.md §7).

**DB tasks:** Insert one row per submission; no update path (a user can submit feedback once per contract at MVP — re-submission overwrites via upsert on `(user_id, contract_id)` if the PRD later requires it, not specified as a constraint currently).

**API routes:** `POST /api/feedback` (full spec in engineering-doc.md §9).

**State management:** Local component state only (simple form) — TanStack Query mutation for the submit call, no persistent client cache needed.

**Component spec:**
- Small widget embedded in the results page (near the disclaimer): thumbs up/down toggle buttons + optional text field, "Submit" button.

**Design:** Uses standard button/input tokens from `docs/design.md`; no bespoke styling.

**Edge cases:**
- Submitted without a comment → `comment` is nullable, allowed.
- Double-submit (rapid double-click) → submit button disabled immediately on click until the mutation resolves.

---

## Cross-Cutting: Rate Limiting, Retries, Error Handling

Not a standalone PRD component, but required across B, C, and F (every OpenAI-calling route):

- **Rate limiting:** `lib/api/rateLimit.ts` checks-and-increments the `rate_limits` table per `(user_id, route, window)` before any OpenAI call; returns `429` on exceed.
- **Retry:** `lib/openai/withRetry.ts` — 3 attempts, exponential backoff, applied uniformly to extraction and chat calls.
- **Error surface:** `lib/api/errors.ts` standardizes `{ error: { code, message } }`; frontend maps known `code` values to specific UI copy (e.g. `SCANNED_PDF`, `TOKEN_LIMIT_EXCEEDED`, `OPENAI_UNAVAILABLE`) and falls back to a generic message otherwise.

These will be expanded into their own spec file (`docs/specs/api-infrastructure.md`) in Stage 2 since multiple features depend on them.
