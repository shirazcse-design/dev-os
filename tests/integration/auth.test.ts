import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/security/rateLimiter', () => ({
  checkRateLimit: vi.fn(),
  getClientIdentifier: vi.fn(() => '127.0.0.1'),
}))

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/security/rateLimiter'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as logout } from '@/app/api/auth/logout/route'

function loginRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
  })

  it('returns 429 when the IP is rate limited, before checking credentials', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 60 })
    const res = await login(loginRequest({ email: 'a@b.com', password: 'x' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid body', async () => {
    const res = await login(loginRequest({ email: 'not-an-email' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 for wrong credentials without leaking whether the email exists', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'x' } }) },
    } as never)
    const res = await login(loginRequest({ email: 'a@b.com', password: 'wrong' }))
    expect(res.status).toBe(401)
    expect((await res.json()).error.message).toBe('Invalid email or password.')
  })

  it('returns 200 with the user on success', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { session: { access_token: 't' }, user: { id: 'user-1', email: 'a@b.com' } },
          error: null,
        }),
      },
    } as never)
    const res = await login(loginRequest({ email: 'a@b.com', password: 'correct' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: { id: 'user-1', email: 'a@b.com' } })
  })
})

describe('POST /api/auth/logout', () => {
  it('signs out server-side and returns success', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ auth: { signOut } } as never)
    const res = await logout()
    expect(res.status).toBe(200)
    expect(signOut).toHaveBeenCalled()
    expect(await res.json()).toEqual({ success: true })
  })
})
