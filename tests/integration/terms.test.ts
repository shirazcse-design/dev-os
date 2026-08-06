import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createMockSupabase, queryResult } from './helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { PATCH } from '@/app/api/terms/[id]/route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/terms/term-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('PATCH /api/terms/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase(null) as never)
    const res = await PATCH(req({ value: 'Delaware' }), { params: { id: 'term-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 400 for an empty value', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ id: 'user-1' }) as never)
    const res = await PATCH(req({ value: '' }), { params: { id: 'term-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 404 for a term whose parent contract is not owned by the caller', async () => {
    const supabase = createMockSupabase({ id: 'user-1' })
    supabase.from.mockReturnValueOnce(queryResult(null, { message: 'no rows' }))
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const res = await PATCH(req({ value: 'Delaware' }), { params: { id: 'term-1' } })
    expect(res.status).toBe(404)
  })

  it('updates the term and logs a correction on success', async () => {
    const supabase = createMockSupabase({ id: 'user-1' })
    supabase.from
      .mockReturnValueOnce(queryResult({ id: 'term-1', original_value: 'California' })) // fetch
      .mockReturnValueOnce(queryResult({ id: 'term-1', value: 'Delaware', edited: true })) // update
      .mockReturnValueOnce(queryResult(null)) // term_corrections insert
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const res = await PATCH(req({ value: 'Delaware' }), { params: { id: 'term-1' } })
    expect(res.status).toBe(200)
    expect((await res.json()).key_term.value).toBe('Delaware')
  })
})
