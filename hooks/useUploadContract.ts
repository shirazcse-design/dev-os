import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api/fetchJson'
import type { ContractType, UploadContractResponse } from '@/types'

interface UploadContractInput {
  file: File
  contractType: ContractType
}

export function useUploadContract() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ file, contractType }: UploadContractInput) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('contract_type', contractType)
      return fetchJson<UploadContractResponse>('/api/contracts', {
        method: 'POST',
        body: formData,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
    },
  })
}
