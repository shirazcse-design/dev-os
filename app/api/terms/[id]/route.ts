import { NextRequest, NextResponse } from 'next/server'
import { badRequest, notFound, serverError } from '@/lib/api/errors'
import { isAuthFailure, requireAuth } from '@/lib/security/authGuard'
import { termUpdateSchema } from '@/lib/validation/schemas'
import type { UpdateTermResponse } from '@/types'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response
  const { user, supabase } = auth

  const parsed = termUpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return badRequest('INVALID_VALUE', 'Value must be 1-2000 characters.')
  }
  const { value } = parsed.data

  const { data: term, error: fetchError } = await supabase
    .from('key_terms')
    .select('*, contracts!inner(user_id)')
    .eq('id', params.id)
    .eq('contracts.user_id', user.id)
    .single()
  if (fetchError || !term) return notFound('TERM_NOT_FOUND', 'Key term not found.')

  const { data: updated, error: updateError } = await supabase
    .from('key_terms')
    .update({ value, edited: true })
    .eq('id', params.id)
    .select()
    .single()
  if (updateError) return serverError('DB_WRITE_FAILED', updateError.message)

  await supabase.from('term_corrections').insert({
    key_term_id: params.id,
    original_value: term.original_value,
    corrected_value: value,
  })

  const body: UpdateTermResponse = { key_term: updated }
  return NextResponse.json(body)
}
