'use client'

import { Suspense, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  )
}

function SignUpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSubmitting(true)
    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({ email, password })
    setSubmitting(false)

    if (signUpError) {
      if (/already registered/i.test(signUpError.message)) {
        setError('An account with this email already exists. Try signing in instead.')
      } else {
        setError('Something went wrong. Please try again.')
      }
      return
    }

    router.push(searchParams.get('redirect') ?? '/dashboard')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-24">
      <div className="flex w-full max-w-[400px] flex-col gap-6 rounded-lg border border-grey-100 p-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[24px] font-medium leading-[32px] text-grey-900">
            Create your account
          </h1>
          <p className="text-[12px] font-normal leading-[18px] text-grey-500">
            Start reviewing NDAs and MSAs in minutes.
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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-grey-100 px-3 py-2 text-[16px] font-medium leading-[24px] text-grey-900 outline-none transition-colors duration-100 focus:border-blue-500"
            />
            <span className="text-[12px] font-normal leading-[18px] text-grey-400">
              At least 8 characters.
            </span>
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
            {submitting ? 'Creating account…' : 'Get started'}
          </button>
        </form>

        <p className="text-[12px] font-normal leading-[18px] text-grey-500">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-blue-500 hover:text-blue-600">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
