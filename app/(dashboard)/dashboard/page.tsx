'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useContracts } from '@/hooks/useContracts'
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { ContractTable } from '@/components/dashboard/ContractTable'

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const sort = (searchParams.get('sort') as 'date' | 'name' | 'type') ?? 'date'
  const order = (searchParams.get('order') as 'asc' | 'desc') ?? 'desc'

  const { data, isLoading, isError } = useContracts({ sort, order, summary: true })

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12 md:px-0">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-[24px] font-medium leading-[32px] text-grey-900">Dashboard</h1>
          <p className="text-[12px] font-normal leading-[18px] text-grey-500">
            Your contract review history.
          </p>
        </div>
        <Link
          href="/upload"
          className="rounded-md bg-blue-500 px-6 py-3 text-[16px] font-medium leading-[24px] text-white transition-colors duration-100 hover:bg-blue-600"
        >
          Review a Contract
        </Link>
      </div>

      {isLoading && (
        <p className="text-[16px] font-medium leading-[24px] text-grey-500">Loading…</p>
      )}

      {isError && (
        <p className="text-[16px] font-medium leading-[24px] text-red-700">
          Something went wrong loading your contracts.
        </p>
      )}

      {data && data.contracts.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-grey-200 bg-grey-25 px-6 py-16 text-center">
          <p className="text-[16px] font-medium leading-[24px] text-grey-900">
            No contracts reviewed yet — upload your first contract to begin.
          </p>
          <Link
            href="/upload"
            className="rounded-md bg-blue-500 px-6 py-3 text-[16px] font-medium leading-[24px] text-white transition-colors duration-100 hover:bg-blue-600"
          >
            Review a Contract
          </Link>
        </div>
      )}

      {data && data.contracts.length > 0 && (
        <>
          <SummaryCards total={data.contracts.length} totals={data.totals} />
          <ContractTable contracts={data.contracts} sort={sort} order={order} />
        </>
      )}
    </main>
  )
}
