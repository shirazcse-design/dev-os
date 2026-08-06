import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createMockSupabase, queryResult } from './helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/feedback/route'

const uuid = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/feedback', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/feedback', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase(null) as never)
    const res = await POST(req({ contract_id: uuid, rating: 'up' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid rating', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ id: 'user-1' }) as never)
    const res = await POST(req({ contract_id: uuid, rating: 'sideways' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 for a contract not owned by the caller', async () => {
    const supabase = createMockSupabase({ id: 'user-1' })
    supabase.from.mockReturnValueOnce(queryResult(null))
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const res = await POST(req({ contract_id: uuid, rating: 'up' }))
    expect(res.status).toBe(404)
  })

  it('records feedback on success', async () => {
    const supabase = createMockSupabase({ id: 'user-1' })
    supabase.from
      .mockReturnValueOnce(queryResult({ id: uuid }))
      .mockReturnValueOnce(queryResult({ id: 'feedback-1' }))
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const res = await POST(req({ contract_id: uuid, rating: 'down', comment: 'Missed a clause' }))
    expect(res.status).toBe(201)
    expect((await res.json()).feedback_id).toBe('feedback-1')
  })
})
