import { NextResponse } from 'next/server'

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

export const unauthorized = (message = 'Sign in required') =>
  errorResponse(401, 'UNAUTHORIZED', message)
export const badRequest = (code: string, message: string) => errorResponse(400, code, message)
export const notFound = (code: string, message: string) => errorResponse(404, code, message)
export const conflict = (code: string, message: string) => errorResponse(409, code, message)
export const unprocessable = (code: string, message: string) => errorResponse(422, code, message)
export const tooManyRequests = (code: string, message: string, retryAfterSeconds?: number) => {
  const res = errorResponse(429, code, message)
  if (retryAfterSeconds) res.headers.set('Retry-After', String(retryAfterSeconds))
  return res
}
export const badGateway = (code: string, message: string) => errorResponse(502, code, message)
export const serverError = (code: string, message: string) => errorResponse(500, code, message)
