# Spec: PDF Upload & Text Extraction

Implements PRD Component B / FR-02 / FR-03 / US-002.

## User Flow

1. User navigates to `/upload`, selects contract type (NDA or MSA) from a dropdown.
2. User drags a PDF into the dropzone or picks one via file browser.
3. Frontend pre-validates client-side (MIME type `application/pdf`, size ≤ 10MB) before any network call.
4. Frontend submits `POST /api/contracts` as `multipart/form-data`.
5. Route Handler validates server-side, uploads the raw file to Supabase Storage (non-blocking), extracts text with `pdf-parse`, inserts `[PAGE N]` markers, validates word/token counts, inserts a `contracts` row, returns the contract id + standard term preview list.
6. Frontend advances the upload wizard to the "preview" step, showing the standard term list for the selected type (static, client-side — see Term Library below) and the "+ Add Key Term" affordance (spec: `docs/specs/key-term-extraction.md`).

## DB Schema

`contracts` table — see `docs/specs/supabase-schema.sql`. This spec owns the `INSERT` on upload; `status` starts at `'uploaded'`.

## DB Tasks

- Insert one `contracts` row per successful upload:
```sql
insert into public.contracts (user_id, contract_type, file_name, file_path, contract_text, page_count, status)
values ($1, $2, $3, $4, $5, $6, 'uploaded')
returning id;
```
- If the Storage upload step fails, still perform this insert with `file_path = null` — text extraction and the AI pipeline must not depend on Storage succeeding.

## API Routes

### `POST /api/contracts`

- **Auth:** Required (see `docs/specs/auth.md`).
- **Request:** `multipart/form-data`
  - `file`: PDF binary, required
  - `contract_type`: `"nda" | "msa"`, required
- **Response `201`:**
```json
{
  "contract_id": "uuid",
  "page_count": 12,
  "status": "uploaded",
  "standard_terms": ["Parties", "Effective Date", "..."]
}
```
- **Response `400`:** `{ "error": { "code": "INVALID_FILE", "message": "File must be a PDF under 10MB." } }`
- **Response `422`:** `{ "error": { "code": "SCANNED_PDF", "message": "Scanned PDFs are not supported yet." } }` or `{ "error": { "code": "TOKEN_LIMIT_EXCEEDED", "message": "This contract exceeds the 15,000 token limit for MVP." } }` or `{ "error": { "code": "PAGE_LIMIT_EXCEEDED", "message": "This contract exceeds the 20-page limit." } }`

**Handler logic (`app/api/contracts/route.ts`):**
```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const formData = await req.formData()
  const file = formData.get('file') as File
  const contractType = formData.get('contract_type') as 'nda' | 'msa'

  if (!file || file.type !== 'application/pdf') {
    return badRequest('INVALID_FILE', 'File must be a PDF.')
  }
  if (file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
    return badRequest('INVALID_FILE', 'File must be under 10MB.')
  }
  if (!['nda', 'msa'].includes(contractType)) {
    return badRequest('INVALID_CONTRACT_TYPE', 'contract_type must be nda or msa.')
  }

  const contractId = crypto.randomUUID()
  const buffer = Buffer.from(await file.arrayBuffer())

  // 1. Extract text FIRST — the AI pipeline depends on this, not on Storage.
  const { text, pageCount } = await extractTextWithPageMarkers(buffer)
  const wordCount = text.trim().split(/\s+/).length
  if (wordCount < 100) {
    return unprocessable('SCANNED_PDF', 'Scanned PDFs are not supported yet.')
  }
  if (pageCount > MAX_PAGE_COUNT) {
    return unprocessable('PAGE_LIMIT_EXCEEDED', 'This contract exceeds the 20-page limit.')
  }
  const tokenEstimate = estimateTokens(text)
  if (tokenEstimate > MAX_CONTRACT_TOKENS) {
    return unprocessable('TOKEN_LIMIT_EXCEEDED', 'This contract exceeds the 15,000 token limit for MVP.')
  }

  // 2. Non-blocking Storage upload — failure only disables the PDF viewer later.
  // Path is relative to the `contracts` bucket — do NOT prefix with "contracts/"
  // again, or storage.foldername(name)[1] in the RLS policies will resolve to
  // the literal string "contracts" instead of the user id, breaking every policy.
  const filePath = `${user.id}/${contractId}/${file.name}`
  let storedPath: string | null = filePath
  const { error: storageError } = await supabase.storage.from('contracts').upload(filePath, buffer, {
    contentType: 'application/pdf',
  })
  if (storageError) storedPath = null

  // 3. Persist.
  const { data, error } = await supabase
    .from('contracts')
    .insert({
      id: contractId,
      user_id: user.id,
      contract_type: contractType,
      file_name: file.name,
      file_path: storedPath,
      contract_text: text,
      page_count: pageCount,
      status: 'uploaded',
    })
    .select('id, page_count')
    .single()

  if (error) return serverError('DB_WRITE_FAILED', error.message)

  return NextResponse.json(
    {
      contract_id: data.id,
      page_count: data.page_count,
      status: 'uploaded',
      standard_terms: STANDARD_TERMS[contractType],
    },
    { status: 201 }
  )
}
```

## Term Library (client + server shared constant)

`lib/prompts/termLibrary.ts`:
```ts
export const STANDARD_TERMS: Record<'nda' | 'msa', string[]> = {
  nda: [
    'Parties', 'Effective Date', 'Confidentiality Obligations', 'Permitted Disclosures',
    'Term & Duration', 'Governing Law', 'Jurisdiction', 'IP Ownership',
    'Non-Solicitation', 'Breach & Remedy',
  ],
  msa: [
    'Parties', 'Service Scope', 'Payment Terms', 'Invoice Schedule',
    'Late Payment Penalty', 'Liability Cap', 'Indemnification', 'IP Ownership',
    'Termination Clause', 'Governing Law', 'Dispute Resolution', 'Notice Period',
  ],
}
```

## Text Extraction Utility

`lib/pdf/extractText.ts` — wraps `pdf-parse`, inserting `[PAGE N]` markers between page boundaries (pdf-parse exposes a `pagerender` hook to track page breaks):
```ts
import pdf from 'pdf-parse'

export async function extractTextWithPageMarkers(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  let pageCount = 0
  const pages: string[] = []

  await pdf(buffer, {
    pagerender: async (pageData) => {
      pageCount += 1
      const content = await pageData.getTextContent()
      const pageText = content.items.map((item: any) => item.str).join(' ')
      pages.push(`[PAGE ${pageCount}]\n${pageText}`)
      return pageText
    },
  })

  return { text: pages.join('\n\n'), pageCount }
}
```

Token estimation (`lib/openai/estimateTokens.ts`) uses a simple chars/4 heuristic pre-extraction; exact token counts are validated by OpenAI at call time — this is a fast pre-flight gate, not the authoritative check.

## State Management

- Zustand `uploadWizardStore` (`stores/uploadWizardStore.ts`): `{ step: 'select-type' | 'upload' | 'preview' | 'processing', contractType, file, contractId, customTerms }`. Purely client-side wizard state — cleared on navigation away from `/upload`.
- TanStack Query mutation `useUploadContract()` wraps the `POST /api/contracts` call, invalidates the `contracts` list query on success (so the dashboard reflects the new upload).

## Component Spec

- `components/upload/UploadDropzone.tsx` — drag-and-drop zone + file picker fallback; shows upload/extraction progress; disables submit until a valid file + type are both set.
- `components/upload/TermPreviewList.tsx` — renders `STANDARD_TERMS[contractType]` as a static list once the type is selected (before upload even completes), so the user knows what will be extracted.

## Design

Dropzone uses `docs/design.md`'s card/border-dashed pattern; progress states use the design system's semantic loading/error tokens.

## Edge Cases

- Non-PDF file dropped → rejected client-side, no request sent.
- File exactly at 10MB boundary → server-side check is `size > MAX_UPLOAD_SIZE_MB * 1024 * 1024`, i.e. exactly 10,485,760 bytes is allowed, one byte over is rejected.
- PDF with 0 extractable pages (corrupted) → `pdf-parse` throws → caught, returns `400 INVALID_FILE` with "This PDF could not be read. Please check the file and try again."
- Contract type mismatch (user selects NDA but uploads an MSA) → not blocked at upload; PRD accepts graceful degradation — extraction still runs against the NDA term library, and low confidence scores naturally signal the mismatch.
- Concurrent uploads by the same user → each gets its own `contract_id`; no dedup logic at MVP.

## Acceptance Criteria

- [ ] (US-002) A valid PDF ≤ 10MB / ≤ 20 pages / ≥ 100 extractable words uploads successfully and returns `201` with `contract_id`, `page_count`, and the standard term list for the selected type, in ≤ 30s P95 for a ≤ 20-page contract.
- [ ] A non-PDF file is rejected client-side before any network request is sent.
- [ ] A PDF over 10MB is rejected server-side with `400 INVALID_FILE`, even if it somehow bypasses the client-side check.
- [ ] A file exactly at 10,485,760 bytes is accepted; 10,485,761 bytes is rejected.
- [ ] A PDF with < 100 extractable words (image-only/scanned) is rejected with `422 SCANNED_PDF` and the message "Scanned PDFs are not supported yet." — no `contracts` row is created.
- [ ] A PDF over 20 pages is rejected with `422 PAGE_LIMIT_EXCEEDED` — no `contracts` row is created.
- [ ] A PDF whose extracted text exceeds ~15,000 tokens is rejected with `422 TOKEN_LIMIT_EXCEEDED` — no `contracts` row is created.
- [ ] `contract_text` stored on the `contracts` row contains `[PAGE N]` markers for every page boundary, in order, starting at `[PAGE 1]`.
- [ ] If the Supabase Storage upload fails (simulated failure), the `contracts` row is still created with `file_path = null`, `status = 'uploaded'`, and `contract_text` populated — the upload flow does not fail as a whole.
- [ ] The stored Storage object path is `{user_id}/{contract_id}/{filename}.pdf` (no `contracts/` prefix) so the RLS policies in `supabase-schema.sql` correctly scope access to the uploading user.
- [ ] Selecting a contract type before upload renders the correct static standard-term list (`STANDARD_TERMS[contractType]`) immediately, with no network round-trip.
