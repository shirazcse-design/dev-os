import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * Service-role client — bypasses RLS entirely. Only for operations that must
 * run outside a user's own row-level policies (e.g. rate-limit counters the
 * user must not be able to read, insert, or reset via their own session).
 * Never expose this client or its key to the browser.
 */
export function createAdminClient(): SupabaseClient {
  if (!client) {
    client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return client
}
