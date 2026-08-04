// Cross-cutting type definitions used by both frontend components/hooks and backend Route
// Handlers. These mirror docs/specs/supabase-schema.sql exactly — any schema change must
// update this file in the same commit. See docs/specs/types.md.

export type ContractType = 'nda' | 'msa'
export type ContractStatus = 'uploaded' | 'processing' | 'completed' | 'error'
export type ChatRole = 'user' | 'assistant'
export type ContextSource = 'contract' | 'history' | 'both'
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
  source_type: ContextSource | null
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

/** Standard error shape returned by every Route Handler — see lib/api/errors.ts. */
export interface ApiError {
  error: {
    code: string
    message: string
  }
}

// --- API response types ------------------------------------------------------

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
    'id' | 'contract_type' | 'file_name' | 'status' | 'page_count' | 'created_at' | 'contract_text'
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
