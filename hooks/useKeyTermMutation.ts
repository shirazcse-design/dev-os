import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api/fetchJson'
import type { GetContractResponse, UpdateTermResponse } from '@/types'

export function useKeyTermMutation(contractId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['contract', contractId]

  return useMutation({
    mutationFn: ({ termId, value }: { termId: string; value: string }) =>
      fetchJson<UpdateTermResponse>(`/api/terms/${termId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      }),
    onMutate: async ({ termId, value }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<GetContractResponse>(queryKey)

      if (previous) {
        queryClient.setQueryData<GetContractResponse>(queryKey, {
          ...previous,
          key_terms: previous.key_terms.map((term) =>
            term.id === termId ? { ...term, value, edited: true } : term
          ),
        })
      }

      return { previous }
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })
}
