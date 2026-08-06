import { describe, expect, it } from 'vitest'
import {
  badGateway,
  badRequest,
  conflict,
  notFound,
  serverError,
  tooManyRequests,
  unauthorized,
  unprocessable,
} from '@/lib/api/errors'

async function body(res: Response) {
  return res.json()
}

describe('error helpers', () => {
  it('unauthorized defaults to a generic message', async () => {
    const res = unauthorized()
    expect(res.status).toBe(401)
    expect(await body(res)).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } })
  })

  it('unauthorized accepts a custom message', async () => {
    const res = unauthorized('Invalid email or password.')
    expect((await body(res)).error.message).toBe('Invalid email or password.')
  })

  it('badRequest returns 400 with the given code/message', async () => {
    const res = badRequest('VALIDATION_ERROR', 'bad input')
    expect(res.status).toBe(400)
    expect(await body(res)).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'bad input' } })
  })

  it('notFound returns 404', () => {
    expect(notFound('X', 'y').status).toBe(404)
  })

  it('conflict returns 409', () => {
    expect(conflict('X', 'y').status).toBe(409)
  })

  it('unprocessable returns 422', () => {
    expect(unprocessable('X', 'y').status).toBe(422)
  })

  it('badGateway returns 502', () => {
    expect(badGateway('X', 'y').status).toBe(502)
  })

  it('serverError returns 500', () => {
    expect(serverError('X', 'y').status).toBe(500)
  })

  it('tooManyRequests returns 429 without a Retry-After header by default', () => {
    const res = tooManyRequests('RATE_LIMITED', 'slow down')
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeNull()
  })

  it('tooManyRequests sets Retry-After when given a duration', () => {
    const res = tooManyRequests('RATE_LIMITED', 'slow down', 60)
    expect(res.headers.get('Retry-After')).toBe('60')
  })
})
