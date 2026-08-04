import type { ApiError } from '@/types'

/** Fetches JSON and throws a human-readable Error (message from ApiError.error.message) on failure. */
export async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  const data = await res.json()
  if (!res.ok) {
    const message = (data as ApiError)?.error?.message ?? 'Something went wrong. Please try again.'
    throw new Error(message)
  }
  return data as T
}
