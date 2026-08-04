'use client'

import { Suspense, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    setSubmitting(false)

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error?.message ?? 'Invalid email or password.')
      return
    }

    router.push(searchParams.get('redirect') ?? '/dashboard')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-24">
      <div className="flex w-full max-w-[400px] flex-col gap-6 rounded-lg border border-grey-100 p-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[24px] font-medium leading-[32px] text-grey-900">Sign in</h1>
          <p className="text-[12px] font-normal leading-[18px] text-grey-500">
            Welcome back to ContractIQ.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-[12px] font-normal leading-[18px] text-grey-500">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-grey-100 px-3 py-2 text-[16px] font-medium leading-[24px] text-grey-900 outline-none transition-colors duration-100 focus:border-blue-500"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="password"
              className="text-[12px] font-normal leading-[18px] text-grey-500"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-grey-100 px-3 py-2 text-[16px] font-medium leading-[24px] text-grey-900 outline-none transition-colors duration-100 focus:border-blue-500"
            />
          </div>

          {error && (
            <p role="alert" className="text-[12px] font-normal leading-[18px] text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-blue-500 px-6 py-3 text-[16px] font-medium leading-[24px] text-white transition-colors duration-100 hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-grey-200"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-[12px] font-normal leading-[18px] text-grey-500">
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="font-medium text-blue-500 hover:text-blue-600">
            Get started
          </Link>
        </p>
      </div>
    </main>
  )
}
