import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJson } from '@/lib/api/fetchJson'

describe('fetchJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ hello: 'world' }) })
    )
    await expect(fetchJson('/x')).resolves.toEqual({ hello: 'world' })
  })

  it('throws the API error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { code: 'X', message: 'Something specific broke.' } }),
      })
    )
    await expect(fetchJson('/x')).rejects.toThrow('Something specific broke.')
  })

  it('falls back to a generic message when the error body has no message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }))
    await expect(fetchJson('/x')).rejects.toThrow('Something went wrong. Please try again.')
  })
})
