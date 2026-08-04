# Spec: Results Display (PDF Viewer + Key Terms Panel + Inline Editing)

Implements PRD Component E / FR-06 / FR-07 / FR-11 / US-003 / US-006 / US-009.

## User Flow

1. User lands on `/contracts/[id]` (from dashboard or post-processing redirect).
2. Frontend fetches `GET /api/contracts/{id}` — contract metadata, key terms, and a signed PDF URL (if `file_path` is set).
3. Two-panel layout renders: left = PDF viewer (or text-viewer fallback), right = key terms panel.
4. Clicking a term's page number scrolls/highlights that page in the viewer (`targetPage` prop).
5. Clicking a term's value opens inline edit mode; on save, `PATCH /api/terms/{id}` persists the correction.
6. Terms with `confidence_score < 50` render a ⚠️ icon + non-dismissible tooltip; clicking such a term also triggers the nearest-page auto-highlight.
7. Each term has an expandable "Why?" section showing `source_sentence`.
8. A "Not legal advice" disclaimer is always visible on this page.

## DB Schema

Reads `contracts`, `key_terms`. Writes `key_terms` (value/edited/original_value) and `term_corrections` on edit — see `docs/specs/supabase-schema.sql`.

## DB Tasks

- `PATCH` updates `key_terms.value` and sets `edited = true` (original preserved in `original_value`, never overwritten after the first extraction).
- Insert into `term_corrections` on every edit: `{ key_term_id, original_value, corrected_value }` — feeds the PRD's correction-rate monitoring (alert if > 12% in any 7-day window).

## API Routes

### `GET /api/contracts/{id}`
- **Auth:** Required; ownership enforced.
- **Response `200`:**
```json
{
  "contract": {
    "id": "uuid", "contract_type": "nda", "file_name": "acme-nda.pdf",
    "status": "completed", "page_count": 8, "created_at": "2026-07-30T10:00:00Z"
  },
  "key_terms": [ /* same shape as /api/extract response */ ],
  "signed_pdf_url": "https://.../contracts/...pdf?token=... | null"
}
```
- If `contracts.file_path` is `null`, `signed_pdf_url` is `null` and the frontend must render `TextViewerFallback` using `contract.contract_text`.
- Signed URL generated per-request via `supabase.storage.from('contracts').createSignedUrl(file_path, 3600)` (1-hour expiry per PRD).
- **Errors:** `404` (`CONTRACT_NOT_FOUND`).

### `PATCH /api/terms/{id}`
- **Auth:** Required; the term's parent contract must belong to the caller (checked via join).
- **Request:** `{ "value": "State of California" }`
- **Response `200`:**
```json
{ "key_term": { "id": "uuid", "value": "State of California", "original_value": "State of Delaware", "edited": true, "...": "..." } }
```
- **Validation:** `value` non-empty, max 2000 chars.
- **Must complete within 2 seconds** (PRD constraint) — single-row update + single-row insert, no heavy work.
- **Errors:** `404` (`TERM_NOT_FOUND`), `400` (`INVALID_VALUE`).

**Handler logic (`app/api/terms/[id]/route.ts`):**
```ts
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { value } = await req.json()
  if (!value || value.length > 2000) return badRequest('INVALID_VALUE', 'Value must be 1-2000 characters.')

  const { data: term, error: fetchError } = await supabase
    .from('key_terms')
    .select('*, contracts!inner(user_id)')
    .eq('id', params.id)
    .eq('contracts.user_id', user.id)
    .single()
  if (fetchError || !term) return notFound('TERM_NOT_FOUND', 'Key term not found.')

  const { data: updated, error: updateError } = await supabase
    .from('key_terms')
    .update({ value, edited: true })
    .eq('id', params.id)
    .select()
    .single()
  if (updateError) return serverError('DB_WRITE_FAILED', updateError.message)

  await supabase.from('term_corrections').insert({
    key_term_id: params.id,
    original_value: term.original_value,
    corrected_value: value,
  })

  return NextResponse.json({ key_term: updated })
}
```

## State Management

- `useContractDetail(id)` — TanStack Query, keyed `['contract', id]`, refetch on window focus disabled (avoid disrupting active edits).
- `useKeyTermMutation()` — TanStack Query mutation with optimistic update: immediately reflects the new value in the cache, rolls back on error.
- Zustand `viewerStore` — `{ targetPage, zoom }`, purely ephemeral, reset on unmount.

## Component Spec

- `components/results/PdfViewer.tsx` — PDF.js-based, props: `{ url: string, targetPage: number, onPageChange?: (page: number) => void }`. Renders all pages lazily (only nearby pages mounted), scroll-to-page on `targetPage` change with a brief highlight flash on the target paragraph region.
- `components/results/TextViewerFallback.tsx` — props: `{ contractText: string, targetPage: number }`. Splits `contractText` on `/\[PAGE (\d+)\]/` markers, renders each as a labelled `<section id="page-N">`, scrolls to `#page-{targetPage}` on prop change. Must support the same `targetPage`-driven navigation as `PdfViewer` (FR-06 parity requirement).
- `components/results/KeyTermsPanel.tsx` — maps `key_terms` to `KeyTermRow`.
- `components/results/KeyTermRow.tsx` — term name, value (click to edit inline), page number (click sets `viewerStore.targetPage`), `ConfidenceBadge`, "Edited" badge if `edited`, expandable "Why?" showing `source_sentence`.
- `components/results/ConfidenceBadge.tsx` — colour-coded per §Design below; ⚠️ icon + tooltip when `confidence_score < 50`.
- `components/shared/Disclaimer.tsx` — static banner, rendered once per results page.

## Design

- Two-panel layout on viewports ≥ 768px; tabbed (PDF / Terms / Chat) below that breakpoint — per `docs/design.md` responsive grid rules.
- Confidence colours: green ≥ 80%, amber 50–79%, red < 50% — always paired with text/icon (not colour alone), per WCAG 2.1 AA.
- Edit-in-place uses the design system's inline input pattern, not a modal.

## Edge Cases

- `file_path` is `null` → render `TextViewerFallback` transparently, no error shown to the user.
- Edit save fails (network/500) → optimistic value rolls back, inline error toast: "Couldn't save your edit — try again."
- Editing a term to an empty string → blocked client-side before the request is sent.
- Two terms reference the same page → both clickable, each independently sets `targetPage` (no conflict, last click wins).
- Contract `status = 'error'` → results page shows an error state with a "Retry Processing" button that re-calls `POST /api/extract` (see `docs/specs/key-term-extraction.md`) instead of rendering the (nonexistent) key terms panel.
- Contract `status = 'processing'` (user navigates directly to the URL, e.g. reload) → results page shows the processing indicator and polls, rather than a blank/error state.

## Acceptance Criteria

- [ ] (US-003) Every key term row displays its page number, and clicking it scrolls the PDF viewer (or text fallback) to the corresponding page within 300ms.
- [ ] (US-006) The PDF viewer supports scroll and zoom, and clicking a highlighted span updates the key-terms panel selection (or vice versa).
- [ ] (US-006) When `file_path` is `null`, `TextViewerFallback` renders with full `targetPage` navigation parity with `PdfViewer` — no dead-end state.
- [ ] (US-009) Editing a term's value and saving persists within ≤ 2s, shows an "Edited" badge, and preserves `original_value` unchanged in the database.
- [ ] Every term with `confidence_score < 50` renders a ⚠️ icon plus visible text (not color alone), satisfying WCAG 2.1 AA non-color-only signaling.
- [ ] The "Not legal advice" disclaimer is present and visible on every render of the results page, including error and processing states.
- [ ] A failed edit save rolls back the optimistic UI update to the pre-edit value and shows an inline error, without corrupting the displayed `original_value`.
- [ ] The two-panel layout collapses to a tabbed PDF/Terms/Chat layout below 768px viewport width, per `docs/design.md` responsive rules.
