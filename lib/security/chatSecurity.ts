import type { SupabaseClient } from '@supabase/supabase-js'
import type { Contract, ChatSession } from '@/types'

type OwnedContract = Pick<Contract, 'id' | 'status' | 'contract_text'>

/**
 * Returns the contract only if it belongs to `userId`, scoping the query by
 * `user_id` in addition to relying on RLS — defense in depth, per
 * engineering-doc.md's "enforced twice" convention. Returns null (not a thrown
 * error) on any mismatch so the caller can respond 404 without leaking whether
 * the contract exists for a different user.
 */
export async function verifyContractOwnership(
  supabase: SupabaseClient,
  contractId: string,
  userId: string
): Promise<OwnedContract | null> {
  const { data } = await supabase
    .from('contracts')
    .select('id, status, contract_text')
    .eq('id', contractId)
    .eq('user_id', userId)
    .single()
  return data
}

export async function verifySessionOwnership(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<Pick<ChatSession, 'id'> | null> {
  const { data } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()
  return data
}
