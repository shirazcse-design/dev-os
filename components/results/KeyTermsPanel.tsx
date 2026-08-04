'use client'

import { useKeyTermMutation } from '@/hooks/useKeyTermMutation'
import { KeyTermRow } from '@/components/results/KeyTermRow'
import type { KeyTerm } from '@/types'

interface KeyTermsPanelProps {
  contractId: string
  keyTerms: KeyTerm[]
}

export function KeyTermsPanel({ contractId, keyTerms }: KeyTermsPanelProps) {
  const mutation = useKeyTermMutation(contractId)

  return (
    <div className="flex flex-col gap-3">
      {keyTerms.map((term) => (
        <KeyTermRow
          key={term.id}
          term={term}
          isSaving={mutation.isPending && mutation.variables?.termId === term.id}
          saveError={
            mutation.isError && mutation.variables?.termId === term.id
              ? "Couldn't save your edit — try again."
              : null
          }
          onSave={(value) => mutation.mutate({ termId: term.id, value })}
        />
      ))}
    </div>
  )
}
