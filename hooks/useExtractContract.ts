import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api/fetchJson'
import type { ExtractContractResponse } from '@/types'

export function useExtractContract() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ contractId, customTerms }: { contractId: string; customTerms: string[] }) =>
      fetchJson<ExtractContractResponse>('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: contractId, custom_terms: customTerms }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contract', variables.contractId] })
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
    },
  })
}
