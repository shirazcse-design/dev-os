# Spec: Dashboard & History

Implements PRD Component G / FR-10 / US-008.

## User Flow

1. User signs in → lands on `/dashboard`.
2. Frontend fetches `GET /api/contracts?summary=true` → renders summary cards (total contracts, breakdown by type) + a sortable table of contract history.
3. Empty state (no contracts yet) shows: "No contracts reviewed yet — upload your first contract to begin," with a prominent "Review a Contract" CTA.
4. Clicking any row navigates to `/contracts/[id]` (results page).
5. Sort controls (by date/name/type) update the URL query params, which drive the `GET /api/contracts` query.

## DB Schema

Reads `contracts` only — no new tables. Relies on the indexes already defined in `docs/specs/supabase-schema.sql` (`idx_contracts_user_created`, `idx_contracts_user_status`).

## DB Tasks

None beyond the base schema — this feature is read-only against `contracts`.

## API Routes

### `GET /api/contracts`
- **Auth:** Required.
- **Query params:** `summary` (`"true" | "false"`, default `"false"`), `sort` (`"date" | "name" | "type"`, default `"date"`), `order` (`"asc" | "desc"`, default `"desc"`).
- **Response `200`:**
```json
{
  "contracts": [
    { "id": "uuid", "file_name": "acme-nda.pdf", "contract_type": "nda", "status": "completed", "created_at": "2026-07-30T10:00:00Z" }
  ],
  "totals": { "nda": 7, "msa": 3 }
}
```
(`totals` included only when `summary=true`.)

**Handler logic (`app/api/contracts/route.ts`, `GET` export alongside the `POST` from `docs/specs/upload-extraction.md`):**
```ts
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(req.url)
  const sort = searchParams.get('sort') ?? 'date'
  const order = searchParams.get('order') ?? 'desc'
  const summary = searchParams.get('summary') === 'true'

  const sortColumn = { date: 'created_at', name: 'file_name', type: 'contract_type' }[sort] ?? 'created_at'

  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('id, file_name, contract_type, status, created_at')
    .eq('user_id', user.id)
    .order(sortColumn, { ascending: order === 'asc' })
  if (error) return serverError('DB_READ_FAILED', error.message)

  const body: any = { contracts }
  if (summary) {
    body.totals = {
      nda: contracts.filter((c) => c.contract_type === 'nda').length,
      msa: contracts.filter((c) => c.contract_type === 'msa').length,
    }
  }
  return NextResponse.json(body)
}
```

## State Management

- `useContracts({ sort, order })` — TanStack Query, keyed `['contracts', sort, order]`, refetches on window focus (dashboard should reflect recent activity).
- Sort/order state lives in the URL (`useSearchParams`), not Zustand — makes the sorted view shareable/bookmarkable and avoids duplicating state.

## Component Spec

- `components/dashboard/SummaryCards.tsx` — total contracts, NDA/MSA breakdown, from `totals`.
- `components/dashboard/ContractTable.tsx` — columns: file name, type, date, status badge; header clicks toggle `sort`/`order` URL params; row click navigates to `/contracts/{id}`.
- Empty state rendered inline in `app/(dashboard)/dashboard/page.tsx` when `contracts.length === 0`.

## Design

Table/row styling per `docs/design.md`'s data-row component pattern; status badges (`uploaded` / `processing` / `completed` / `error`) use distinct semantic color tokens, each paired with text (not color alone).

## Edge Cases

- Zero contracts → empty state, no table rendered.
- A contract in `status = 'error'` → shown with a distinct badge and a "Retry" link that navigates to `/contracts/{id}` where the retry action lives (see `docs/specs/key-term-extraction.md` edge cases).
- A contract in `status = 'processing'` (user navigated away mid-processing) → shown with a "Processing..." badge; row click still navigates to the results page, which will show its own processing/polling state.
- Very large history (hundreds of contracts) — no pagination at MVP per PRD (500 active users / ~2,000 contracts/month scale is the target ceiling); revisit if dashboard load time degrades.

## Acceptance Criteria

- [ ] (US-008) Dashboard displays file name, contract type, upload date, and status for every contract owned by the signed-in user, and no contracts owned by any other user.
- [ ] A brand-new user with zero contracts sees the empty state message and CTA, never a blank table or a loading spinner that never resolves.
- [ ] Clicking a column header toggles sort order and updates the URL query params (`sort`, `order`); reloading the page with those params preserves the same sort.
- [ ] Clicking any contract row navigates to `/contracts/{id}` for that exact contract.
- [ ] Summary totals (`totals.nda`, `totals.msa`) match the count of contracts of each type actually owned by the user, verified against `GET /api/contracts?summary=true`.
- [ ] A contract in `status = 'error'` renders a distinct status badge from `'completed'`/`'processing'`/`'uploaded'`, each paired with visible text (not color alone).
