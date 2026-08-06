import { describe, expect, it } from 'vitest'
import {
  chatRequestSchema,
  extractRequestSchema,
  feedbackRequestSchema,
  loginRequestSchema,
  termUpdateSchema,
} from '@/lib/validation/schemas'

const uuid = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

describe('loginRequestSchema', () => {
  it('accepts a valid email/password', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true)
  })
  it('rejects an invalid email', () => {
    expect(loginRequestSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false)
  })
  it('rejects an empty password', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false)
  })
})

describe('extractRequestSchema', () => {
  it('accepts a valid request with no custom terms', () => {
    const result = extractRequestSchema.safeParse({ contract_id: uuid })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.custom_terms).toEqual([])
  })
  it('rejects a non-uuid contract_id', () => {
    expect(extractRequestSchema.safeParse({ contract_id: 'not-a-uuid' }).success).toBe(false)
  })
  it('rejects more than 5 custom terms', () => {
    const result = extractRequestSchema.safeParse({
      contract_id: uuid,
      custom_terms: ['a', 'b', 'c', 'd', 'e', 'f'],
    })
    expect(result.success).toBe(false)
  })
})

describe('chatRequestSchema', () => {
  it('accepts a valid message with null session_id', () => {
    const result = chatRequestSchema.safeParse({
      session_id: null,
      contract_id: uuid,
      message: 'What happens if I breach this agreement?',
    })
    expect(result.success).toBe(true)
  })
  it('rejects an empty message', () => {
    const result = chatRequestSchema.safeParse({ session_id: null, contract_id: uuid, message: '' })
    expect(result.success).toBe(false)
  })
  it('rejects a message over 2000 characters', () => {
    const result = chatRequestSchema.safeParse({
      session_id: null,
      contract_id: uuid,
      message: 'a'.repeat(2001),
    })
    expect(result.success).toBe(false)
  })
})

describe('termUpdateSchema', () => {
  it('rejects an empty value', () => {
    expect(termUpdateSchema.safeParse({ value: '' }).success).toBe(false)
  })
  it('accepts a normal value', () => {
    expect(termUpdateSchema.safeParse({ value: 'Delaware' }).success).toBe(true)
  })
})

describe('feedbackRequestSchema', () => {
  it('accepts up/down ratings', () => {
    expect(feedbackRequestSchema.safeParse({ contract_id: uuid, rating: 'up' }).success).toBe(true)
    expect(feedbackRequestSchema.safeParse({ contract_id: uuid, rating: 'down' }).success).toBe(true)
  })
  it('rejects an invalid rating', () => {
    expect(feedbackRequestSchema.safeParse({ contract_id: uuid, rating: 'sideways' }).success).toBe(false)
  })
})
