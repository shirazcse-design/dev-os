import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// The client must call this route instead of supabase.auth.signOut() directly
// so the session cookie is cleared server-side and can't be left stale by a
// browser tab that missed the client-side signOut call.
export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.json({ success: true })
}
