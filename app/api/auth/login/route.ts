import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { badRequest, tooManyRequests, unauthorized } from '@/lib/api/errors'
import { checkRateLimit, getClientIdentifier } from '@/lib/security/rateLimiter'
import { loginRequestSchema } from '@/lib/security/inputValidator'

// Server-side so cookies are set correctly via the @supabase/ssr server client
// (the client-side signInWithPassword path writes cookies through the browser
// client instead) and so login attempts can be rate-limited by IP before any
// credential is checked — a client-side call cannot enforce that.
export async function POST(req: NextRequest) {
  const identifier = getClientIdentifier(req)
  const { allowed, retryAfterSeconds } = await checkRateLimit(identifier, 'auth')
  if (!allowed) {
    return tooManyRequests(
      'RATE_LIMITED',
      'Too many login attempts. Try again shortly.',
      retryAfterSeconds
    )
  }

  const parsed = loginRequestSchema.safeParse(await req.json())
  if (!parsed.success) {
    return badRequest('VALIDATION_ERROR', 'Email and password are required.')
  }
  const { email, password } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    return unauthorized('Invalid email or password.')
  }

  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } })
}
