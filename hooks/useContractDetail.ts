import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api/fetchJson'
import type { GetContractResponse } from '@/types'

export function useContractDetail(contractId: string) {
  return useQuery({
    queryKey: ['contract', contractId],
    queryFn: () => fetchJson<GetContractResponse>(`/api/contracts/${contractId}`),
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      query.state.data?.contract.status === 'processing' ? 2000 : false,
  })
}
