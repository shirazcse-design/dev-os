import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type RateLimitAction = 'auth' | 'chat' | 'extract' | 'upload'

// Sliding-window size per action, in seconds.
const WINDOW_SECONDS: Record<RateLimitAction, number> = {
  auth: 60,
  chat: 60,
  extract: 3600,
  upload: 86400,
}

export const RATE_LIMITS: Record<RateLimitAction, number> = {
  auth: 10, // 10 requests / minute
  chat: 30, // 30 requests / minute
  extract: 5, // 5 requests / hour
  upload: 20, // 20 uploads / day
}

/**
 * IP-based identifier for routes with no authenticated user yet (login).
 * Falls back to a fixed string only if no forwarding header is present at
 * all (e.g. local dev without a proxy) — never throws, since a rate limiter
 * must never be the reason a request 500s.
 */
export function getClientIdentifier(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp
  return 'unknown'
}

/**
 * Sliding-window rate limit backed by `rate_limit_events` (service-role only —
 * see supabase/rls-policies.sql). Always uses the admin client so a user can
 * never read or reset their own counters via their session's RLS-scoped access,
 * unlike the old `rate_limits` table which had user-writable insert/update
 * policies.
 *
 * Fails OPEN (allows the request) if the rate-limit backend itself errors —
 * e.g. the migration hasn't been run yet, or a transient DB issue. A broken
 * limiter must degrade to "unlimited," not take the whole app down; every
 * gated route (including login) depends on this succeeding.
 */
export async function checkRateLimit(
  identifier: string,
  action: RateLimitAction
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const windowSeconds = WINDOW_SECONDS[action]
  const limit = RATE_LIMITS[action]
  const admin = createAdminClient()
  const windowStartIso = new Date(Date.now() - windowSeconds * 1000).toISOString()

  try {
    const { count, error: countError } = await admin
      .from('rate_limit_events')
      .select('id', { count: 'exact', head: true })
      .eq('identifier', identifier)
      .eq('action', action)
      .gte('created_at', windowStartIso)
    if (countError) throw countError

    if ((count ?? 0) >= limit) {
      return { allowed: false, retryAfterSeconds: windowSeconds }
    }

    const { error: insertError } = await admin
      .from('rate_limit_events')
      .insert({ identifier, action })
    if (insertError) throw insertError

    return { allowed: true, retryAfterSeconds: 0 }
  } catch (err) {
    console.error('[rateLimiter] backend error, failing open:', action, err)
    return { allowed: true, retryAfterSeconds: 0 }
  }
}
