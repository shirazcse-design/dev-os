import { describe, expect, it } from 'vitest'
import { estimateTokens } from '@/lib/openai/estimateTokens'

describe('estimateTokens', () => {
  it('estimates roughly 4 characters per token', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('a'.repeat(4000))).toBe(1000)
  })

  it('rounds up for partial tokens', () => {
    expect(estimateTokens('abcde')).toBe(2)
  })

  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0)
  })
})
