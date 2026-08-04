# Spec: Key Term Extraction (incl. Custom Terms)

Implements PRD Component C (Key Term Extraction) and Component D (Custom Term Addition) / FR-04 / FR-05 / FR-11 / US-002 / US-004 / US-005.

## User Flow

1. On the `/upload` preview step, the user sees the standard term list (from `docs/specs/upload-extraction.md`) and can click "+ Add Key Term" to type up to 5 custom term names (held in `uploadWizardStore`, not yet persisted).
2. User clicks "Process Contract" → `POST /api/extract` with `contract_id` and `custom_terms`.
3. Route Handler builds the extraction prompt (contract type few-shot examples + full `contract_text` + custom term names), calls OpenAI GPT-4o in JSON mode, parses and validates the response, persists `key_terms` rows (and `custom_key_terms` rows recording the requested names), sets `contracts.status = 'completed'`.
4. Frontend (polling via `useContractDetail`) transitions from the processing indicator to the results page once `status = 'completed'`.

## DB Schema

`key_terms`, `custom_key_terms`, `rate_limits` — see `docs/specs/supabase-schema.sql`.

## DB Tasks

- Insert `custom_key_terms` rows (one per user-requested custom term name) before calling OpenAI, so the 5-term cap trigger (`trg_enforce_custom_term_limit`) is the hard backstop.
- Insert one `key_terms` row per item in the parsed OpenAI response (`is_custom = true` for terms whose name matches a `custom_key_terms.term_name` for that contract, `false` otherwise).
- Update `contracts.status`: `'uploaded' → 'processing'` on request start, `→ 'completed'` on success, `→ 'error'` (+ `error_message`) on unrecoverable failure.
- Rate limit check: read-modify-write `rate_limits` row for `(user_id, 'extract', current_hour_window)` before the OpenAI call; reject with `429` if `request_count >= RATE_LIMIT_EXTRACT_PER_HOUR`.

## API Routes

### `POST /api/extract`

- **Auth:** Required; `contracts.user_id` must equal the session user.
- **Request:**
```json
{ "contract_id": "uuid", "custom_terms": ["Non-compete radius"] }
```
- **Validation:** `custom_terms.length <= 5` (env `MAX_CUSTOM_TERMS`); `contract_id` must reference a contract owned by the caller with `status = 'uploaded'`.
- **Response `200`:**
```json
{
  "contract_id": "uuid",
  "status": "completed",
  "key_terms": [
    {
      "id": "uuid",
      "term_name": "Governing Law",
      "value": "State of Delaware",
      "page_number": 4,
      "confidence_score": 92.5,
      "source_sentence": "This Agreement shall be governed by the laws of the State of Delaware.",
      "is_custom": false,
      "edited": false
    }
  ]
}
```
- **Errors:** `404` (`CONTRACT_NOT_FOUND`), `409` (`ALREADY_PROCESSED` — status is not `'uploaded'`), `422` (`TOO_MANY_CUSTOM_TERMS`), `429` (`RATE_LIMITED`), `502` (`OPENAI_UNAVAILABLE` — after 3 retries exhausted; contract set to `status: 'error'`).

**Handler logic (`app/api/extract/route.ts`):**
```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { contract_id, custom_terms = [] } = await req.json()
  if (custom_terms.length > MAX_CUSTOM_TERMS) {
    return unprocessable('TOO_MANY_CUSTOM_TERMS', `Maximum ${MAX_CUSTOM_TERMS} custom terms allowed.`)
  }

  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', contract_id)
    .eq('user_id', user.id)
    .single()
  if (fetchError || !contract) return notFound('CONTRACT_NOT_FOUND', 'Contract not found.')
  if (contract.status !== 'uploaded') return conflict('ALREADY_PROCESSED', 'Contract has already been processed.')

  const rateLimitOk = await checkAndIncrementRateLimit(supabase, user.id, 'extract', RATE_LIMIT_EXTRACT_PER_HOUR)
  if (!rateLimitOk) return tooManyRequests('RATE_LIMITED', 'Extraction rate limit exceeded. Try again later.')

  await supabase.from('contracts').update({ status: 'processing' }).eq('id', contract_id)

  if (custom_terms.length > 0) {
    await supabase.from('custom_key_terms').insert(
      custom_terms.map((term_name: string) => ({ contract_id, term_name }))
    )
  }

  try {
    const extracted = await extractKeyTermsWithRetry({
      contractType: contract.contract_type,
      contractText: contract.contract_text,
      customTerms: custom_terms,
    })

    const rows = extracted.map((t) => ({
      contract_id,
      term_name: t.term_name,
      value: t.value,
      original_value: t.value,
      page_number: t.page_number,
      confidence_score: t.confidence_score,
      source_sentence: t.source_sentence,
      is_custom: custom_terms.includes(t.term_name),
    }))
    const { data: inserted, error: insertError } = await supabase
      .from('key_terms')
      .insert(rows)
      .select()
    if (insertError) throw insertError

    await supabase.from('contracts').update({ status: 'completed' }).eq('id', contract_id)

    return NextResponse.json({ contract_id, status: 'completed', key_terms: inserted })
  } catch (err) {
    await supabase
      .from('contracts')
      .update({ status: 'error', error_message: (err as Error).message })
      .eq('id', contract_id)
    return badGateway('OPENAI_UNAVAILABLE', 'Extraction failed. Try again in a few minutes.')
  }
}
```

## Prompt Strategy

`lib/prompts/extraction.ts`:
```ts
const SYSTEM_PROMPT = (contractType: 'nda' | 'msa', customTerms: string[]) => `
You are a contract analysis assistant. Extract the following key terms from the contract text provided.
Standard terms for ${contractType.toUpperCase()}: ${STANDARD_TERMS[contractType].join(', ')}.
${customTerms.length ? `Additional custom terms requested by the user: ${customTerms.join(', ')}.` : ''}

For each term, return an object with exactly these fields:
- term_name (string, must match one of the requested term names exactly)
- value (string, the extracted value; if not found in the document, use "Not found")
- page_number (integer, 1-indexed, the page where this term appears)
- confidence_score (float 0-100, your self-assessed confidence in this extraction)
- source_sentence (string, the verbatim sentence from the contract this value was drawn from)

Return ONLY a JSON object: { "terms": [ ... ] }. No explanation, no markdown formatting.

${FEW_SHOT_EXAMPLES[contractType]}
`.trim()

export async function extractKeyTermsWithRetry(input: {
  contractType: 'nda' | 'msa'
  contractText: string
  customTerms: string[]
}) {
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT(input.contractType, input.customTerms) },
    { role: 'user' as const, content: input.contractText },
  ]

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2000,
    })
  )

  const raw = response.choices[0].message.content!
  try {
    return parseAndValidateTerms(raw)
  } catch {
    // Single automatic retry with a corrective prompt on parse failure
    const retryResponse = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      messages: [
        ...messages,
        { role: 'assistant' as const, content: raw },
        { role: 'user' as const, content: 'Your previous response was not valid JSON. Return only the JSON object, no explanation.' },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2000,
    })
    return parseAndValidateTerms(retryResponse.choices[0].message.content!)
  }
}
```

`FEW_SHOT_EXAMPLES` (in `lib/prompts/extraction.examples.ts`) contains 3 labelled NDA examples and 3 labelled MSA examples, each a `{ contract_excerpt, expected_output }` pair covering common clause phrasings — populate from the CUAD dataset / legal SME annotations referenced in the PRD's Evaluation Strategy (§10) before the offline eval suite is built.

`parseAndValidateTerms` (`lib/openai/validateExtraction.ts`) uses a Zod schema to enforce the exact shape above and coerces `confidence_score` into `[0, 100]`; throws if the top-level shape doesn't match (triggering the retry):

```ts
// lib/openai/validateExtraction.ts
import { z } from 'zod'

const extractedTermSchema = z.object({
  term_name: z.string().min(1),
  value: z.string().min(1),
  page_number: z.number().int().positive(),
  confidence_score: z.number().min(0).max(100),
  source_sentence: z.string().min(1),
})

const extractionResponseSchema = z.object({
  terms: z.array(extractedTermSchema),
})

export function parseAndValidateTerms(raw: string) {
  const parsed = extractionResponseSchema.parse(JSON.parse(raw))
  return parsed.terms
}
```

## OpenAI Client

`lib/openai/client.ts` — single shared client instance, imported by both `lib/prompts/extraction.ts` and `lib/prompts/chat.ts`:

```ts
// lib/openai/client.ts
import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID || undefined,
})
```

`OPENAI_API_KEY` and `OPENAI_ORG_ID` are server-only env vars (never referenced in client components) — see `.env.example`.

## State Management

- TanStack Query mutation `useExtractContract()` triggers `POST /api/extract`.
- `useContractDetail(contractId)` polls every 2s while `status === 'processing'`, switches to standard cache behavior once `'completed'` or `'error'`.

## Component Spec

- 3-step progress indicator (`components/upload/ProcessingSteps.tsx`): "Extracting text" (already done by upload time) → "Analysing with AI" → "Compiling results", driven by `contracts.status`.
- `components/results/KeyTermsPanel.tsx` and `components/results/KeyTermRow.tsx` — see `docs/specs/results-display.md`.

## Design

Confidence colour-coding tokens: green (`--color-success`) ≥ 80%, amber (`--color-warning`) 50–79%, red (`--color-danger`) < 50% — defined in `docs/design.md`, never hardcoded hex values.

## Edge Cases

- OpenAI returns fewer terms than requested (e.g. a term genuinely absent from the contract) → `value: "Not found"`, `confidence_score` near 0 — still inserted and shown, per PRD's "never hide a term" rule.
- JSON parse fails twice (initial + retry) → propagate as `OPENAI_UNAVAILABLE`, contract → `status: 'error'`.
- OpenAI request times out (> 20s) or errors transiently → `withRetry` retries 3× with exponential backoff before surfacing failure.
- Custom term name is empty string or duplicate of an existing standard/custom term → rejected client-side in `CustomTermInput`; if it somehow reaches the API, the DB trigger still caps at 5 total rows but does not dedupe — duplicate extraction results are acceptable (not a PRD-specified constraint).
- Rate limit hit mid-wizard (user re-processing after an error) → `429`, UI shows "You've hit the extraction limit. Try again in a few minutes," contract remains in `'error'`/`'uploaded'` for a later retry.

## Acceptance Criteria

- [ ] (US-002, US-004) At least 80% of a contract type's standard terms are populated (non-"Not found") for a well-formed contract of that type, matching the PRD's F1 targets (≥ 88% NDA / ≥ 85% MSA) when evaluated against the offline eval suite.
- [ ] Every returned term includes `term_name`, `value`, `page_number`, `confidence_score` (0–100), and `source_sentence` — no field is ever omitted or null.
- [ ] Terms with `confidence_score < 50` are still inserted and returned (never silently dropped or hidden).
- [ ] (US-005) Submitting 1–5 custom term names extracts and returns them alongside standard terms with `is_custom: true`, using the identical output schema as standard terms.
- [ ] Submitting more than 5 custom terms is rejected with `422 TOO_MANY_CUSTOM_TERMS` before any OpenAI call is made.
- [ ] Calling `/api/extract` on a contract that is not in `status = 'uploaded'` (already processing/completed) returns `409 ALREADY_PROCESSED` and performs no OpenAI call.
- [ ] A malformed/non-JSON OpenAI response triggers exactly one corrective retry; if that also fails, the contract transitions to `status = 'error'` with a non-null `error_message`, and the route returns `502 OPENAI_UNAVAILABLE`.
- [ ] Exceeding `RATE_LIMIT_EXTRACT_PER_HOUR` for the calling user returns `429 RATE_LIMITED` before any OpenAI call is made, and does not increment the rate-limit counter further.
- [ ] End-to-end extraction (upload → process → results rendered) completes in ≤ 15 minutes and costs ≤ $0.20 in OpenAI usage per PRD targets, verified via token-usage logging.
