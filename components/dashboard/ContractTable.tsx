'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { ContractSummary, ContractStatus } from '@/types'

interface ContractTableProps {
  contracts: ContractSummary[]
  sort: 'date' | 'name' | 'type'
  order: 'asc' | 'desc'
}

const STATUS_STYLES: Record<ContractStatus, string> = {
  uploaded: 'border-grey-200 bg-grey-50 text-grey-700',
  processing: 'border-blue-200 bg-blue-50 text-blue-700',
  completed: 'border-green-200 bg-green-50 text-green-700',
  error: 'border-red-200 bg-red-50 text-red-700',
}

const COLUMNS: { key: 'date' | 'name' | 'type'; label: string }[] = [
  { key: 'name', label: 'File name' },
  { key: 'type', label: 'Type' },
  { key: 'date', label: 'Uploaded' },
]

export function ContractTable({ contracts, sort, order }: ContractTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleSort(column: 'date' | 'name' | 'type') {
    const nextOrder = sort === column && order === 'desc' ? 'asc' : 'desc'
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', column)
    params.set('order', nextOrder)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-grey-100">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-grey-100 bg-grey-25">
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-4 py-3">
                <button
                  onClick={() => handleSort(col.key)}
                  className="text-[12px] font-normal leading-[18px] text-grey-500 hover:text-grey-900"
                >
                  {col.label}
                  {sort === col.key && (order === 'asc' ? ' ↑' : ' ↓')}
                </button>
              </th>
            ))}
            <th className="px-4 py-3 text-[12px] font-normal leading-[18px] text-grey-500">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => (
            <tr
              key={contract.id}
              onClick={() => router.push(`/contracts/${contract.id}`)}
              className="cursor-pointer border-b border-grey-50 last:border-0 hover:bg-grey-25"
            >
              <td className="px-4 py-3 text-[16px] font-medium leading-[24px] text-grey-900">
                {contract.file_name}
              </td>
              <td className="px-4 py-3 text-[12px] font-normal leading-[18px] text-grey-500">
                {contract.contract_type.toUpperCase()}
              </td>
              <td className="px-4 py-3 text-[12px] font-normal leading-[18px] text-grey-500">
                {new Date(contract.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-sm border px-2 py-0.5 text-[12px] font-medium leading-[18px] ${STATUS_STYLES[contract.status]}`}
                >
                  {contract.status === 'error' ? 'Error — Retry' : contract.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
