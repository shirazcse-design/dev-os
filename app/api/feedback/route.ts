import { NextRequest, NextResponse } from 'next/server'
import { badRequest, notFound, serverError } from '@/lib/api/errors'
import { isAuthFailure, requireAuth } from '@/lib/security/authGuard'
import { feedbackRequestSchema } from '@/lib/validation/schemas'
import type { FeedbackResponse } from '@/types'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response
  const { user, supabase } = auth

  const parsed = feedbackRequestSchema.safeParse(await req.json())
  if (!parsed.success) {
    return badRequest('VALIDATION_ERROR', parsed.error.message)
  }
  const { contract_id, rating, comment } = parsed.data

  const { data: contract } = await supabase
    .from('contracts')
    .select('id')
    .eq('id', contract_id)
    .eq('user_id', user.id)
    .single()
  if (!contract) return notFound('CONTRACT_NOT_FOUND', 'Contract not found.')

  const { data, error } = await supabase
    .from('user_feedback')
    .insert({ contract_id, user_id: user.id, rating, comment: comment ?? null })
    .select('id')
    .single()
  if (error) return serverError('DB_WRITE_FAILED', error.message)

  const body: FeedbackResponse = { feedback_id: data.id }
  return NextResponse.json(body, { status: 201 })
}
