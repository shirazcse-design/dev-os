import { NextRequest, NextResponse } from 'next/server'
import {
  badGateway,
  badRequest,
  conflict,
  notFound,
  tooManyRequests,
  unprocessable,
} from '@/lib/api/errors'
import { isAuthFailure, requireAuth } from '@/lib/security/authGuard'
import { checkRateLimit } from '@/lib/security/rateLimiter'
import { sanitizeForLLM } from '@/lib/security/promptInjectionGuard'
import { extractKeyTermsWithRetry } from '@/lib/prompts/extraction'
import { extractRequestSchema } from '@/lib/validation/schemas'
import { MAX_CUSTOM_TERMS } from '@/lib/config'
import type { ExtractContractResponse } from '@/types'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response
  const { user, supabase } = auth

  const parsed = extractRequestSchema.safeParse(await req.json())
  if (!parsed.success) {
    return badRequest('VALIDATION_ERROR', parsed.error.message)
  }
  const { contract_id, custom_terms } = parsed.data
  if (custom_terms.length > MAX_CUSTOM_TERMS) {
    return unprocessable('TOO_MANY_CUSTOM_TERMS', `Maximum ${MAX_CUSTOM_TERMS} custom terms allowed.`)
  }
  // Custom term names are embedded directly into the extraction system prompt
  // (see lib/prompts/extraction.ts) — unlike contract text, which is always
  // sent as untrusted user-role content, so these must be screened before
  // ever reaching the model.
  for (const term of custom_terms) {
    const check = sanitizeForLLM(term)
    if (!check.safe) {
      return badRequest('PROMPT_INJECTION', 'One of the custom terms could not be processed.')
    }
  }

  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', contract_id)
    .eq('user_id', user.id)
    .single()
  if (fetchError || !contract) return notFound('CONTRACT_NOT_FOUND', 'Contract not found.')
  // 'error' is re-triggerable without re-upload (results-display.md / dashboard.md "Retry
  // Processing" affordance); only a genuinely completed/in-flight contract is rejected.
  if (contract.status !== 'uploaded' && contract.status !== 'error') {
    return conflict('ALREADY_PROCESSED', 'Contract has already been processed.')
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(user.id, 'extract')
  if (!allowed) {
    return tooManyRequests('RATE_LIMITED', 'Extraction rate limit exceeded. Try again later.', retryAfterSeconds)
  }

  await supabase.from('contracts').update({ status: 'processing' }).eq('id', contract_id)

  // Clear any custom_key_terms/key_terms left over from a prior failed attempt so a
  // retry-after-error stays idempotent instead of accumulating rows against the 5-term cap.
  await supabase.from('custom_key_terms').delete().eq('contract_id', contract_id)
  await supabase.from('key_terms').delete().eq('contract_id', contract_id)

  if (custom_terms.length > 0) {
    await supabase
      .from('custom_key_terms')
      .insert(custom_terms.map((term_name) => ({ contract_id, term_name })))
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

    const body: ExtractContractResponse = {
      contract_id,
      status: 'completed',
      key_terms: inserted,
    }
    return NextResponse.json(body)
  } catch (err) {
    await supabase
      .from('contracts')
      .update({ status: 'error', error_message: (err as Error).message })
      .eq('id', contract_id)
    return badGateway('OPENAI_UNAVAILABLE', 'Extraction failed. Try again in a few minutes.')
  }
}
