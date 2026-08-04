import { NextRequest, NextResponse } from 'next/server'
import { notFound } from '@/lib/api/errors'
import { isAuthFailure, requireAuth } from '@/lib/security/authGuard'
import { verifySessionOwnership } from '@/lib/security/chatSecurity'
import type { ChatHistoryResponse } from '@/types'

export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response
  const { user, supabase } = auth

  const session = await verifySessionOwnership(supabase, params.sessionId, user.id)
  if (!session) return notFound('SESSION_NOT_FOUND', 'Chat session not found.')

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', params.sessionId)
    .order('created_at', { ascending: true })
    .limit(200)

  const body: ChatHistoryResponse = { messages: messages ?? [] }
  return NextResponse.json(body)
}
