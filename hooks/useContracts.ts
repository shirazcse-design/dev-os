import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api/fetchJson'
import type { ListContractsResponse } from '@/types'

interface UseContractsOptions {
  sort?: 'date' | 'name' | 'type'
  order?: 'asc' | 'desc'
  summary?: boolean
}

export function useContracts({ sort = 'date', order = 'desc', summary = false }: UseContractsOptions = {}) {
  return useQuery({
    queryKey: ['contracts', sort, order, summary],
    queryFn: () =>
      fetchJson<ListContractsResponse>(
        `/api/contracts?sort=${sort}&order=${order}&summary=${summary}`
      ),
    refetchOnWindowFocus: true,
  })
}
