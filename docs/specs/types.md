# Spec: Shared TypeScript Types

Cross-cutting type definitions used by both frontend components/hooks and backend Route Handlers. Not a standalone PRD component — implements the shared vocabulary referenced (but not concretely defined) across `auth.md`, `upload-extraction.md`, `key-term-extraction.md`, `results-display.md`, `contract-chat.md`, `dashboard.md`, and `feedback.md`.

All types live in `types/index.ts` and are imported via the `@/types` path alias. These mirror the `docs/specs/supabase-schema.sql` tables exactly — any schema change must update this file in the same commit.

## Core Types

```ts
// types/index.ts

export type ContractType = 'nda' | 'msa'
export type ContractStatus = 'uploaded' | 'processing' | 'completed' | 'error'
export type ChatRole = 'user' | 'assistant'
export type FeedbackRating = 'up' | 'down'

export interface Contract {
  id: string
  user_id: string
  contract_type: ContractType
  file_name: string
  file_path: string | null
  contract_text: string
  page_count: number
  status: ContractStatus
  error_message: string | null
  created_at: string
  updated_at: string
}

export type ContractSummary = Pick<
  Contract,
  'id' | 'file_name' | 'contract_type' | 'status' | 'created_at'
>

export interface KeyTerm {
  id: string
  contract_id: string
  term_name: string
  value: string
  original_value: string
  page_number: number
  confidence_score: number
  source_sentence: string
  is_custom: boolean
  edited: boolean
  created_at: string
}

export interface CustomKeyTerm {
  id: string
  contract_id: string
  term_name: string
  is_manual: boolean
  created_at: string
}

export interface ChatSession {
  id: string
  contract_id: string
  user_id: string
  created_at: string
}

export interface ChatMessage {
  id: string
  session_id: string
  role: ChatRole
  content: string
  created_at: string
}

export interface UserFeedback {
  id: string
  contract_id: string
  user_id: string
  rating: FeedbackRating
  comment: string | null
  created_at: string
}

export interface TermCorrection {
  id: string
  key_term_id: string
  original_value: string
  corrected_value: string
  corrected_at: string
}

/** Field extracted per term by the OpenAI extraction call, before DB insertion. */
export interface ExtractedTerm {
  term_name: string
  value: string
  page_number: number
  confidence_score: number
  source_sentence: string
}

/** Standard error shape returned by every Route Handler — see api-infrastructure.md. */
export interface ApiError {
  error: {
    code: string
    message: string
  }
}
```

## API Response Types

```ts
// types/index.ts (continued)

export interface UploadContractResponse {
  contract_id: string
  page_count: number
  status: 'uploaded'
  standard_terms: string[]
}

export interface ExtractContractResponse {
  contract_id: string
  status: 'completed'
  key_terms: KeyTerm[]
}

export interface ListContractsResponse {
  contracts: ContractSummary[]
  totals?: { nda: number; msa: number }
}

export interface GetContractResponse {
  contract: Pick<
    Contract,
    'id' | 'contract_type' | 'file_name' | 'status' | 'page_count' | 'created_at'
  >
  key_terms: KeyTerm[]
  signed_pdf_url: string | null
}

export interface UpdateTermResponse {
  key_term: KeyTerm
}

export interface ChatResponse {
  session_id: string
  message: ChatMessage
}

export interface ChatHistoryResponse {
  messages: ChatMessage[]
}

export interface FeedbackResponse {
  feedback_id: string
}
```

## Usage Rules

- Route Handlers import these types for their response bodies — never inline ad-hoc response shapes.
- TanStack Query hooks (`useContracts`, `useContractDetail`, `useChatMessages`, etc.) are generic over these types, e.g. `useQuery<GetContractResponse>(...)`.
- Zod schemas in `lib/validation/schemas.ts` (see `api-infrastructure.md`) validate *requests*; these types describe *responses* and DB rows — the two are kept separate since request validation needs runtime checks and response types do not.
- `confidence_score` is `numeric(5,2)` in Postgres but arrives as a JS `number` through the Supabase client — no manual parsing needed.
- Never redefine `ContractType` / `ContractStatus` / `ChatRole` / `FeedbackRating` locally in a component — always import from `@/types` so a schema enum change (e.g. adding a new `contract_type`) is a single-file update.

## Acceptance Criteria

- [ ] Every Route Handler's response body is typed against one of the interfaces above (verified via `satisfies` or explicit return typing) — no `any`-typed API responses.
- [ ] `types/index.ts` has zero runtime code (types/interfaces only) so it can be imported from both client and server code without bundling concerns.
- [ ] A change to `supabase-schema.sql` (new column, renamed column, new enum value) is never merged without a corresponding update to `types/index.ts` in the same change.
