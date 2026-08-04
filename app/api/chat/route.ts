import { NextRequest, NextResponse } from 'next/server'
import { badGateway, badRequest, conflict, notFound, tooManyRequests } from '@/lib/api/errors'
import { isAuthFailure, requireAuth } from '@/lib/security/authGuard'
import { checkRateLimit } from '@/lib/security/rateLimiter'
import { sanitizeForLLM } from '@/lib/security/promptInjectionGuard'
import { verifyContractOwnership, verifySessionOwnership } from '@/lib/security/chatSecurity'
import { MAX_CHAT_HISTORY } from '@/lib/security/tokenLimiter'
import { chatRequestSchema } from '@/lib/validation/schemas'
import { getChatCompletionWithRetry } from '@/lib/prompts/chat'
import type { ChatResponse } from '@/types'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response
  const { user, supabase } = auth

  const parsed = chatRequestSchema.safeParse(await req.json())
  if (!parsed.success) {
    return badRequest('VALIDATION_ERROR', parsed.error.message)
  }
  const { session_id, contract_id, message } = parsed.data

  const injectionCheck = sanitizeForLLM(message)
  if (!injectionCheck.safe) {
    return badRequest('PROMPT_INJECTION', 'This message could not be processed.')
  }

  const contract = await verifyContractOwnership(supabase, contract_id, user.id)
  if (!contract) return notFound('CONTRACT_NOT_FOUND', 'Contract not found.')
  if (contract.status !== 'completed') {
    return conflict('CONTRACT_NOT_READY', 'Chat is only available once contract processing is complete.')
  }

  if (session_id) {
    const session = await verifySessionOwnership(supabase, session_id, user.id)
    if (!session) return notFound('SESSION_NOT_FOUND', 'Chat session not found.')
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(user.id, 'chat')
  if (!allowed) {
    return tooManyRequests('RATE_LIMITED', 'Chat rate limit exceeded. Try again later.', retryAfterSeconds)
  }

  let sessionId = session_id
  if (!sessionId) {
    const { data: session } = await supabase
      .from('chat_sessions')
      .insert({ contract_id, user_id: user.id })
      .select('id')
      .single()
    sessionId = session!.id as string
  }

  // Load prior history BEFORE persisting the new user message. If loaded after, the
  // fetched "history" would include the new message itself, and the classifier would
  // always see it as part of history instead of the message being classified.
  const { data: priorHistoryDesc } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(Math.min(20, MAX_CHAT_HISTORY))
  const priorHistory = (priorHistoryDesc ?? []).reverse()

  await supabase.from('chat_messages').insert({ session_id: sessionId, role: 'user', content: message })

  try {
    const { reply, source } = await getChatCompletionWithRetry({
      contractText: contract.contract_text,
      priorHistory,
      newMessage: message,
    })
    const { data: assistantMessage } = await supabase
      .from('chat_messages')
      .insert({ session_id: sessionId, role: 'assistant', content: reply, source_type: source })
      .select()
      .single()

    const body: ChatResponse = { session_id: sessionId, message: assistantMessage }
    return NextResponse.json(body)
  } catch {
    return badGateway(
      'OPENAI_UNAVAILABLE',
      'Chat is temporarily unavailable. Your message was saved — try again shortly.'
    )
  }
}
