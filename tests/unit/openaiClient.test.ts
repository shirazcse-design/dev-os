import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('getOpenAIClient', () => {
  const originalBaseUrl = process.env.OPENAI_BASE_URL
  const originalApiKey = process.env.OPENAI_API_KEY

  beforeEach(() => {
    vi.resetModules()
    process.env.OPENAI_API_KEY = 'test-key'
  })
  afterEach(() => {
    process.env.OPENAI_BASE_URL = originalBaseUrl
    process.env.OPENAI_API_KEY = originalApiKey
  })

  it('returns the same instance on repeated calls (singleton)', async () => {
    const { getOpenAIClient } = await import('@/lib/openai/client')
    expect(getOpenAIClient()).toBe(getOpenAIClient())
  })

  it('honors OPENAI_BASE_URL when set, for E2E mock redirection', async () => {
    process.env.OPENAI_BASE_URL = 'http://127.0.0.1:4318/v1'
    const { getOpenAIClient } = await import('@/lib/openai/client')
    expect(getOpenAIClient().baseURL).toBe('http://127.0.0.1:4318/v1')
  })
})
