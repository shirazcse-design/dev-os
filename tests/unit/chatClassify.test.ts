import { describe, expect, it } from 'vitest'
import { classifyQuery } from '@/lib/prompts/chat'

describe('classifyQuery', () => {
  it('classifies a plain document question as CONTRACT', () => {
    expect(classifyQuery('What happens if either party breaches this agreement?', true)).toBe('contract')
  })

  it('classifies a plain document question as CONTRACT even with no history', () => {
    expect(classifyQuery('What is the governing law of this contract?', false)).toBe('contract')
  })

  it('classifies a conversation-referencing question as HISTORY when history exists', () => {
    expect(classifyQuery('What did I just ask you earlier?', true)).toBe('history')
  })

  it('falls back to CONTRACT for a history-shaped question with no prior history', () => {
    // Nothing to reference yet — hasHistory=false must override the pattern match.
    expect(classifyQuery('What did you say earlier?', false)).toBe('contract')
  })

  it('classifies a question referencing both the conversation and the document as BOTH', () => {
    expect(
      classifyQuery(
        'You mentioned injunctive relief earlier — does the contract termination clause match what you said?',
        true
      )
    ).toBe('both')
  })

  it('does not classify BOTH when history reference is present but no contract keyword matches', () => {
    expect(classifyQuery('What did I ask you before?', true)).toBe('history')
  })

  it('is case-insensitive', () => {
    expect(classifyQuery('WHAT DID YOU SAY EARLIER?', true)).toBe('history')
  })
})
