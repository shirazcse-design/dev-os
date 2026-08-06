import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/openai/client', () => ({ getOpenAIClient: vi.fn() }))

import { getOpenAIClient } from '@/lib/openai/client'
import { extractKeyTermsWithRetry } from '@/lib/prompts/extraction'

function completionWith(content: string) {
  return { choices: [{ message: { content } }] }
}

const validTerm = {
  term_name: 'Parties',
  value: 'Acme Inc.',
  page_number: 1,
  confidence_score: 90,
  source_sentence: 'Acme Inc. enters into this Agreement.',
}

describe('extractKeyTermsWithRetry', () => {
  it('returns parsed terms on a valid first response', async () => {
    const create = vi.fn().mockResolvedValue(completionWith(JSON.stringify({ terms: [validTerm] })))
    vi.mocked(getOpenAIClient).mockReturnValue({ chat: { completions: { create } } } as never)

    const result = await extractKeyTermsWithRetry({
      contractType: 'nda',
      contractText: 'text',
      customTerms: [],
    })
    expect(result).toEqual([validTerm])
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('retries once with a corrective prompt when the first response is invalid JSON', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(completionWith('not valid json'))
      .mockResolvedValueOnce(completionWith(JSON.stringify({ terms: [validTerm] })))
    vi.mocked(getOpenAIClient).mockReturnValue({ chat: { completions: { create } } } as never)

    const result = await extractKeyTermsWithRetry({
      contractType: 'nda',
      contractText: 'text',
      customTerms: [],
    })
    expect(result).toEqual([validTerm])
    expect(create).toHaveBeenCalledTimes(2)
    const secondCallMessages = create.mock.calls[1][0].messages
    expect(secondCallMessages.at(-1).content).toMatch(/not valid JSON/i)
  })

  it('throws when both the original and corrective attempts return invalid JSON', async () => {
    const create = vi.fn().mockResolvedValue(completionWith('still not json'))
    vi.mocked(getOpenAIClient).mockReturnValue({ chat: { completions: { create } } } as never)

    await expect(
      extractKeyTermsWithRetry({ contractType: 'nda', contractText: 'text', customTerms: [] })
    ).rejects.toThrow()
  })

  it('includes custom terms in the system prompt', async () => {
    const create = vi.fn().mockResolvedValue(completionWith(JSON.stringify({ terms: [] })))
    vi.mocked(getOpenAIClient).mockReturnValue({ chat: { completions: { create } } } as never)

    await extractKeyTermsWithRetry({
      contractType: 'msa',
      contractText: 'text',
      customTerms: ['Non-compete radius'],
    })
    const systemPrompt = create.mock.calls[0][0].messages[0].content
    expect(systemPrompt).toContain('Non-compete radius')
  })
})
