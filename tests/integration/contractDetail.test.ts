import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createMockSupabase, queryResult } from './helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { GET } from '@/app/api/contracts/[id]/route'

const contractRow = {
  id: 'contract-1',
  contract_type: 'nda',
  file_name: 'sample.pdf',
  file_path: 'user-1/contract-1/sample.pdf',
  status: 'completed',
  page_count: 2,
  created_at: '2026-01-01',
  contract_text: '[PAGE 1]\nSample text',
}

function req() {
  return new NextRequest('http://localhost/api/contracts/contract-1')
}

describe('GET /api/contracts/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase(null) as never)
    const res = await GET(req(), { params: { id: 'contract-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the contract does not belong to the caller (cross-user isolation)', async () => {
    const supabase = createMockSupabase({ id: 'user-1' })
    // .eq('user_id', user.id) means a different owner's contract resolves to no row —
    // simulated here by the mock returning null, exactly what the real query does.
    supabase.from.mockReturnValueOnce(queryResult(null, { message: 'no rows' }))
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const res = await GET(req(), { params: { id: 'contract-1' } })
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('CONTRACT_NOT_FOUND')
  })

  it('returns the contract, key terms, and a signed PDF URL on success', async () => {
    const supabase = createMockSupabase({ id: 'user-1' })
    supabase.from
      .mockReturnValueOnce(queryResult(contractRow))
      .mockReturnValueOnce(queryResult([{ id: 'term-1', term_name: 'Parties', value: 'Acme' }]))
    supabase.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example/x' } }),
    })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const res = await GET(req(), { params: { id: 'contract-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.contract.id).toBe('contract-1')
    expect(body.key_terms).toHaveLength(1)
    expect(body.signed_pdf_url).toBe('https://signed.example/x')
  })

  it('omits the signed URL when the contract has no stored file', async () => {
    const supabase = createMockSupabase({ id: 'user-1' })
    supabase.from
      .mockReturnValueOnce(queryResult({ ...contractRow, file_path: null }))
      .mockReturnValueOnce(queryResult([]))
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const res = await GET(req(), { params: { id: 'contract-1' } })
    const body = await res.json()
    expect(body.signed_pdf_url).toBeNull()
  })
})
