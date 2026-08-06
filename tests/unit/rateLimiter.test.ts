import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIdentifier } from '@/lib/security/rateLimiter'

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'insert']) builder[m] = vi.fn(() => builder)
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return builder
}

describe('getClientIdentifier', () => {
  it('uses the first entry of x-forwarded-for', () => {
    const req = new NextRequest('http://localhost/x', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(getClientIdentifier(req)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = new NextRequest('http://localhost/x', { headers: { 'x-real-ip': '9.9.9.9' } })
    expect(getClientIdentifier(req)).toBe('9.9.9.9')
  })

  it('falls back to "unknown" when neither header is present', () => {
    const req = new NextRequest('http://localhost/x')
    expect(getClientIdentifier(req)).toBe('unknown')
  })
})

describe('checkRateLimit', () => {
  const admin = { from: vi.fn() }

  beforeEach(() => {
    vi.mocked(createAdminClient).mockReturnValue(admin as never)
    admin.from.mockReset()
  })

  it('allows the request when under the limit and records the event', () => {
    const insert = vi.fn(() => chainable({ error: null }))
    admin.from.mockImplementation((table: string) => {
      if (table === 'rate_limit_events') {
        return { ...chainable({ count: 2, error: null }), insert }
      }
      return chainable({})
    })

    return checkRateLimit('user-1', 'chat').then((result) => {
      expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 })
      expect(insert).toHaveBeenCalledWith({ identifier: 'user-1', action: 'chat' })
    })
  })

  it('denies the request once the limit is reached, without inserting a new event', async () => {
    const insert = vi.fn(() => chainable({ error: null }))
    admin.from.mockImplementation(() => ({ ...chainable({ count: 30, error: null }), insert }))

    const result = await checkRateLimit('user-1', 'chat') // limit is 30/min
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(insert).not.toHaveBeenCalled()
  })

  it('fails open when the backend errors', async () => {
    admin.from.mockImplementation(() => chainable({ count: null, error: new Error('table missing') }))
    const result = await checkRateLimit('user-1', 'chat')
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 })
  })
})
