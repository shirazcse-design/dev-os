import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/openai/client', () => ({ getOpenAIClient: vi.fn() }))

import { getOpenAIClient } from '@/lib/openai/client'
import { getChatCompletionWithRetry } from '@/lib/prompts/chat'

function mockCompletion(content: string) {
  const create = vi.fn().mockResolvedValue({ choices: [{ message: { content } }] })
  vi.mocked(getOpenAIClient).mockReturnValue({ chat: { completions: { create } } } as never)
  return create
}

describe('getChatCompletionWithRetry', () => {
  it('sends the contract text and returns a contract-sourced reply for a document question', async () => {
    const create = mockCompletion('The governing law is Delaware. [Page 1]')
    const result = await getChatCompletionWithRetry({
      contractText: 'CONTRACT BODY TEXT',
      priorHistory: [],
      newMessage: 'What is the governing law?',
    })
    expect(result).toEqual({ reply: 'The governing law is Delaware. [Page 1]', source: 'contract' })

    const messages = create.mock.calls[0][0].messages
    expect(messages.some((m: { content: string }) => m.content.includes('CONTRACT BODY TEXT'))).toBe(true)
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'What is the governing law?' })
  })

  it('omits the contract text for a history-sourced question', async () => {
    const create = mockCompletion('You asked about the effective date. [From conversation]')
    const result = await getChatCompletionWithRetry({
      contractText: 'CONTRACT BODY TEXT',
      priorHistory: [{ role: 'user', content: 'What is the effective date?' }],
      newMessage: 'What did I just ask you earlier?',
    })
    expect(result.source).toBe('history')
    const messages = create.mock.calls[0][0].messages
    expect(messages.some((m: { content: string }) => m.content.includes('CONTRACT BODY TEXT'))).toBe(false)
  })

  it('throws a guardrail error when the reply has no source attribution', async () => {
    mockCompletion('Here is an answer with no citation at all.')
    await expect(
      getChatCompletionWithRetry({ contractText: 'text', priorHistory: [], newMessage: 'A question?' })
    ).rejects.toThrow()
  })

  it('accepts the "cannot find" fallback phrase without a citation', async () => {
    mockCompletion('I cannot find this in the document.')
    const result = await getChatCompletionWithRetry({
      contractText: 'text',
      priorHistory: [],
      newMessage: 'What is the quantum teleportation clause?',
    })
    expect(result.reply).toBe('I cannot find this in the document.')
  })

  it('caps prior history to the classification-driven turn limit', async () => {
    const create = mockCompletion('Answer. [Page 1]')
    const longHistory = Array.from({ length: 15 }, (_, i) => ({
      role: 'user' as const,
      content: `turn ${i}`,
    }))
    await getChatCompletionWithRetry({ contractText: 'text', priorHistory: longHistory, newMessage: 'new' })

    const messages = create.mock.calls[0][0].messages
    // CONTRACT source uses a 10-turn window (9 prior + the new message).
    const turnMessages = messages.filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
    expect(turnMessages).toHaveLength(10)
    expect(turnMessages.at(-1)).toEqual({ role: 'user', content: 'new' })
  })
})
