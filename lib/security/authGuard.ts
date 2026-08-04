import { createClient } from '@/lib/supabase/server'
import { unauthorized } from '@/lib/api/errors'
import type { SupabaseClient, User } from '@supabase/supabase-js'

type AuthSuccess = { user: User; supabase: SupabaseClient }
type AuthFailure = { response: ReturnType<typeof unauthorized> }

/**
 * Verifies the Supabase session cookie and returns the authenticated user plus
 * a request-scoped client. Every Route Handler must call this before touching
 * the database — do not read `request.headers` or trust any client-supplied
 * user id instead.
 */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { response: unauthorized() }
  return { user, supabase }
}

export function isAuthFailure(result: AuthSuccess | AuthFailure): result is AuthFailure {
  return 'response' in result
}
