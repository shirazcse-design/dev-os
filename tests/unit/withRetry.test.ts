import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withRetry } from '@/lib/openai/withRetry'

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(withRetry(fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and succeeds on a later attempt', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail once')).mockResolvedValueOnce('ok')
    const promise = withRetry(fn)
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws the last error after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    const promise = withRetry(fn, 3)
    const assertion = expect(promise).rejects.toThrow('always fails')
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not sleep after the final attempt', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    const promise = withRetry(fn, 1)
    const assertion = expect(promise).rejects.toThrow('fail')
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
