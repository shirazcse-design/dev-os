'use client'

import { useState, type FormEvent } from 'react'

interface CustomTermInputProps {
  customTerms: string[]
  onAdd: (term: string) => void
  onRemove: (term: string) => void
}

const MAX_CUSTOM_TERMS = 5

export function CustomTermInput({ customTerms, onAdd, onRemove }: CustomTermInputProps) {
  const [draft, setDraft] = useState('')
  const atLimit = customTerms.length >= MAX_CUSTOM_TERMS

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (atLimit || !draft.trim()) return
    onAdd(draft)
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-3">
      {customTerms.map((term) => (
        <div
          key={term}
          className="flex items-center justify-between rounded-md border border-violet-200 bg-violet-50 px-3 py-2"
        >
          <span className="text-[16px] font-medium leading-[24px] text-grey-900">{term}</span>
          <button
            type="button"
            onClick={() => onRemove(term)}
            aria-label={`Remove custom term ${term}`}
            className="text-[12px] font-normal leading-[18px] text-grey-500 hover:text-red-700"
          >
            Remove
          </button>
        </div>
      ))}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={atLimit}
          placeholder="e.g. Non-compete radius"
          title={atLimit ? 'You can add up to 5 custom terms.' : undefined}
          className="flex-1 rounded-md border border-grey-100 px-3 py-2 text-[16px] font-medium leading-[24px] text-grey-900 outline-none transition-colors duration-100 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-grey-25"
        />
        <button
          type="submit"
          disabled={atLimit || !draft.trim()}
          className="rounded-md border border-grey-100 px-4 py-2 text-[16px] font-medium leading-[24px] text-grey-900 transition-colors duration-100 hover:border-grey-200 hover:bg-grey-50 disabled:cursor-not-allowed disabled:text-grey-400"
        >
          + Add Key Term
        </button>
      </form>
      {atLimit && (
        <p className="text-[12px] font-normal leading-[18px] text-grey-500">
          You&apos;ve reached the 5 custom term limit.
        </p>
      )}
    </div>
  )
}
