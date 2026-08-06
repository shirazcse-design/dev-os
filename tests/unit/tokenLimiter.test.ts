import { describe, expect, it } from 'vitest'
import { isWithinMessageLength, isWithinPageCountCeiling, MAX_MESSAGE_LENGTH } from '@/lib/security/tokenLimiter'
import { MAX_PAGE_COUNT } from '@/lib/config'

describe('isWithinPageCountCeiling', () => {
  it('accepts a page count within the product limit', () => {
    expect(isWithinPageCountCeiling(1)).toBe(true)
    expect(isWithinPageCountCeiling(MAX_PAGE_COUNT)).toBe(true)
  })
  it('rejects a page count over the limit', () => {
    expect(isWithinPageCountCeiling(MAX_PAGE_COUNT + 1)).toBe(false)
  })
})

describe('isWithinMessageLength', () => {
  it('rejects an empty message', () => {
    expect(isWithinMessageLength('')).toBe(false)
  })
  it('accepts a normal message', () => {
    expect(isWithinMessageLength('What is the governing law?')).toBe(true)
  })
  it('accepts exactly the max length', () => {
    expect(isWithinMessageLength('a'.repeat(MAX_MESSAGE_LENGTH))).toBe(true)
  })
  it('rejects a message over the max length', () => {
    expect(isWithinMessageLength('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toBe(false)
  })
})
