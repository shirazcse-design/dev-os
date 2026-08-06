import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createMockSupabase, queryResult } from './helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/security/rateLimiter', () => ({ checkRateLimit: vi.fn() }))
vi.mock('@/lib/security/inputValidator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/inputValidator')>()
  return { ...actual, validateFileUpload: vi.fn() }
})
vi.mock('@/lib/pdf/extractText', () => ({ extractTextWithPageMarkers: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/security/rateLimiter'
import { validateFileUpload } from '@/lib/security/inputValidator'
import { extractTextWithPageMarkers } from '@/lib/pdf/extractText'
import { GET, POST } from '@/app/api/contracts/route'

const LONG_TEXT = 'word '.repeat(150)

function getRequest(url = 'http://localhost/api/contracts') {
  return new NextRequest(url)
}

function uploadRequest(formData: FormData) {
  return new NextRequest('http://localhost/api/contracts', { method: 'POST', body: formData })
}

function validForm() {
  const fd = new FormData()
  fd.set('file', new File(['%PDF-1.4'], 'contract.pdf', { type: 'application/pdf' }))
  fd.set('contract_type', 'nda')
  return fd
}

describe('GET /api/contracts', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase(null) as never)
    const res = await GET(getRequest())
    expect(res.status).toBe(401)
  })

  it('returns the caller\'s contracts with NDA/MSA totals', async () => {
    const supabase = createMockSupabase({ id: 'user-1' })
    supabase.from.mockReturnValueOnce(
      queryResult([
        { id: 'c1', file_name: 'a.pdf', contract_type: 'nda', status: 'completed', created_at: '2026-01-01' },
        { id: 'c2', file_name: 'b.pdf', contract_type: 'msa', status: 'completed', created_at: '2026-01-02' },
      ])
    )
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const res = await GET(getRequest('http://localhost/api/contracts?summary=true'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.contracts).toHaveLength(2)
    expect(body.totals).toEqual({ nda: 1, msa: 1 })
  })
})

describe('POST /api/contracts', () => {
  beforeEach(() => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    vi.mocked(validateFileUpload).mockResolvedValue({ valid: true })
    vi.mocked(extractTextWithPageMarkers).mockResolvedValue({ text: LONG_TEXT, pageCount: 2 })
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase(null) as never)
    const res = await POST(uploadRequest(validForm()))
    expect(res.status).toBe(401)
  })

  it('returns 429 when the daily upload limit is hit, before touching the file', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ id: 'user-1' }) as never)
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 3600 })
    const res = await POST(uploadRequest(validForm()))
    expect(res.status).toBe(429)
    expect(validateFileUpload).not.toHaveBeenCalled()
  })

  it('returns 400 when file validation fails (e.g. blocked/spoofed file)', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ id: 'user-1' }) as never)
    vi.mocked(validateFileUpload).mockResolvedValue({
      valid: false,
      code: 'BLOCKED_FILE_TYPE',
      message: 'This file type is not allowed.',
    })
    const res = await POST(uploadRequest(validForm()))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('BLOCKED_FILE_TYPE')
  })

  it('returns 400 for an invalid contract_type', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ id: 'user-1' }) as never)
    const fd = validForm()
    fd.set('contract_type', 'lease')
    const res = await POST(uploadRequest(fd))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_CONTRACT_TYPE')
  })

  it('returns 422 SCANNED_PDF for a PDF with too little extractable text', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ id: 'user-1' }) as never)
    vi.mocked(extractTextWithPageMarkers).mockResolvedValue({ text: 'short', pageCount: 1 })
    const res = await POST(uploadRequest(validForm()))
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('SCANNED_PDF')
  })

  it('returns 422 PAGE_LIMIT_EXCEEDED over the page cap', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ id: 'user-1' }) as never)
    vi.mocked(extractTextWithPageMarkers).mockResolvedValue({ text: LONG_TEXT, pageCount: 999 })
    const res = await POST(uploadRequest(validForm()))
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('PAGE_LIMIT_EXCEEDED')
  })

  it('creates the contract on success, tolerating a Storage upload failure', async () => {
    const supabase = createMockSupabase({ id: 'user-1' })
    supabase.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: { message: 'storage down' } }),
    })
    supabase.from.mockReturnValueOnce(queryResult({ id: 'new-contract-id', page_count: 2 }))
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const res = await POST(uploadRequest(validForm()))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.contract_id).toBe('new-contract-id')
    expect(body.status).toBe('uploaded')
    expect(body.standard_terms).toContain('Parties')
  })
})
