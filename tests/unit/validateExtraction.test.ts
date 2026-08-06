import { describe, expect, it } from 'vitest'
import { parseAndValidateTerms } from '@/lib/openai/validateExtraction'

const validTerm = {
  term_name: 'Parties',
  value: 'Acme Inc. and Beacon LLC',
  page_number: 1,
  confidence_score: 92,
  source_sentence: 'This Agreement is between Acme Inc. and Beacon LLC.',
}

describe('parseAndValidateTerms', () => {
  it('parses a valid extraction response', () => {
    const result = parseAndValidateTerms(JSON.stringify({ terms: [validTerm] }))
    expect(result).toEqual([validTerm])
  })

  it('parses an empty terms array', () => {
    expect(parseAndValidateTerms(JSON.stringify({ terms: [] }))).toEqual([])
  })

  it('throws on invalid JSON', () => {
    expect(() => parseAndValidateTerms('not json')).toThrow()
  })

  it('throws when terms is missing', () => {
    expect(() => parseAndValidateTerms(JSON.stringify({}))).toThrow()
  })

  it('throws when a required field is missing', () => {
    const { term_name, ...rest } = validTerm
    expect(() => parseAndValidateTerms(JSON.stringify({ terms: [rest] }))).toThrow()
  })

  it('throws when page_number is not a positive integer', () => {
    const bad = { ...validTerm, page_number: 0 }
    expect(() => parseAndValidateTerms(JSON.stringify({ terms: [bad] }))).toThrow()
  })

  it('throws when confidence_score is out of range', () => {
    const bad = { ...validTerm, confidence_score: 101 }
    expect(() => parseAndValidateTerms(JSON.stringify({ terms: [bad] }))).toThrow()
  })

  it('throws when value is an empty string', () => {
    const bad = { ...validTerm, value: '' }
    expect(() => parseAndValidateTerms(JSON.stringify({ terms: [bad] }))).toThrow()
  })
})
