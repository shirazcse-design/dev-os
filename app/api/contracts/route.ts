import { NextRequest, NextResponse } from 'next/server'
import { badRequest, serverError, tooManyRequests, unprocessable } from '@/lib/api/errors'
import { isAuthFailure, requireAuth } from '@/lib/security/authGuard'
import { checkRateLimit } from '@/lib/security/rateLimiter'
import { validateFileUpload } from '@/lib/security/inputValidator'
import { estimateTokens } from '@/lib/openai/estimateTokens'
import { STANDARD_TERMS } from '@/lib/prompts/termLibrary'
import { MAX_CONTRACT_TOKENS, MAX_PAGE_COUNT, MAX_UPLOAD_SIZE_MB } from '@/lib/config'
import type { ContractType, ListContractsResponse, UploadContractResponse } from '@/types'

// Object storage keys aren't real filesystem paths, but strip anything
// unexpected from the user-supplied filename anyway so it can never produce
// a surprising/oversized storage key.
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9.\-_ ]/g, '_')
  return cleaned.slice(-200) || 'contract.pdf'
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response
  const { user, supabase } = auth

  const { searchParams } = new URL(req.url)
  const sort = searchParams.get('sort') ?? 'date'
  const order = searchParams.get('order') ?? 'desc'
  const summary = searchParams.get('summary') === 'true'

  const sortColumn =
    ({ date: 'created_at', name: 'file_name', type: 'contract_type' } as Record<string, string>)[
      sort
    ] ?? 'created_at'

  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('id, file_name, contract_type, status, created_at')
    .eq('user_id', user.id)
    .order(sortColumn, { ascending: order === 'asc' })
  if (error) return serverError('DB_READ_FAILED', error.message)

  const body: ListContractsResponse = { contracts: contracts ?? [] }
  if (summary) {
    body.totals = {
      nda: (contracts ?? []).filter((c) => c.contract_type === 'nda').length,
      msa: (contracts ?? []).filter((c) => c.contract_type === 'msa').length,
    }
  }
  return NextResponse.json(body)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response
  const { user, supabase } = auth

  const { allowed, retryAfterSeconds } = await checkRateLimit(user.id, 'upload')
  if (!allowed) {
    return tooManyRequests('RATE_LIMITED', 'Upload limit reached for today. Try again tomorrow.', retryAfterSeconds)
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const contractType = formData.get('contract_type') as ContractType | null

  if (!file) {
    return badRequest('INVALID_FILE', 'File must be a PDF.')
  }
  const fileValidation = await validateFileUpload(file, MAX_UPLOAD_SIZE_MB)
  if (!fileValidation.valid) {
    return badRequest(fileValidation.code!, fileValidation.message!)
  }
  if (!contractType || !['nda', 'msa'].includes(contractType)) {
    return badRequest('INVALID_CONTRACT_TYPE', 'contract_type must be nda or msa.')
  }

  const contractId = crypto.randomUUID()
  const fileName = sanitizeFileName(file.name)
  const buffer = Buffer.from(await file.arrayBuffer())

  // 1. Extract text FIRST — the AI pipeline depends on this, not on Storage.
  // Imported dynamically (not at module top-level) so the GET handler above — which
  // shares this file per Next.js route-handler convention — never pulls in pdf-parse's
  // bundled pdfjs-dist build, which fails to load under Next dev's webpack runtime.
  let text: string
  let pageCount: number
  try {
    const { extractTextWithPageMarkers } = await import('@/lib/pdf/extractText')
    const extracted = await extractTextWithPageMarkers(buffer)
    text = extracted.text
    pageCount = extracted.pageCount
  } catch {
    return badRequest('INVALID_FILE', 'This PDF could not be read. Please check the file and try again.')
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  if (wordCount < 100) {
    return unprocessable('SCANNED_PDF', 'Scanned PDFs are not supported yet.')
  }
  if (pageCount > MAX_PAGE_COUNT) {
    return unprocessable('PAGE_LIMIT_EXCEEDED', `This contract exceeds the ${MAX_PAGE_COUNT}-page limit.`)
  }
  const tokenEstimate = estimateTokens(text)
  if (tokenEstimate > MAX_CONTRACT_TOKENS) {
    return unprocessable(
      'TOKEN_LIMIT_EXCEEDED',
      `This contract exceeds the ${MAX_CONTRACT_TOKENS.toLocaleString()} token limit for MVP.`
    )
  }

  // 2. Non-blocking Storage upload — failure only disables the PDF viewer later.
  // Path is relative to the `contracts` bucket — do NOT prefix with "contracts/" again,
  // or storage.foldername(name)[1] in the RLS policies will resolve to the literal
  // string "contracts" instead of the user id, breaking every policy.
  const filePath = `${user.id}/${contractId}/${fileName}`
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
      file_name: fileName,
      file_path: storedPath,
      contract_text: text,
      page_count: pageCount,
      status: 'uploaded',
    })
    .select('id, page_count')
    .single()

  if (error) return serverError('DB_WRITE_FAILED', error.message)

  const body: UploadContractResponse = {
    contract_id: data.id,
    page_count: data.page_count,
    status: 'uploaded',
    standard_terms: STANDARD_TERMS[contractType],
  }

  return NextResponse.json(body, { status: 201 })
}
