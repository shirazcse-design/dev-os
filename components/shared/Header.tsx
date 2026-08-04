'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/useSession'

export function Header() {
  const router = useRouter()
  const { session } = useSession()

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  return (
    <header className="flex w-full items-center justify-between border-b border-grey-100 px-6 py-4 md:px-28">
      <Link href="/dashboard" className="text-[16px] font-medium leading-[24px] text-grey-900">
        ContractIQ
      </Link>
      <nav className="flex items-center gap-6">
        <Link
          href="/dashboard"
          className="text-[12px] font-normal leading-[18px] text-grey-500 hover:text-grey-900"
        >
          Dashboard
        </Link>
        <Link
          href="/upload"
          className="text-[12px] font-normal leading-[18px] text-grey-500 hover:text-grey-900"
        >
          Review a contract
        </Link>
        {session && (
          <button
            onClick={handleSignOut}
            className="rounded-md border border-grey-100 px-3 py-1.5 text-[12px] font-normal leading-[18px] text-grey-900 transition-colors duration-100 hover:border-grey-200 hover:bg-grey-50"
          >
            Sign out
          </button>
        )}
      </nav>
    </header>
  )
}
