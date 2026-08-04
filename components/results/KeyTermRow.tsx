'use client'

import { useState } from 'react'
import { useViewerStore } from '@/stores/viewerStore'
import { ConfidenceBadge } from '@/components/results/ConfidenceBadge'
import type { KeyTerm } from '@/types'

interface KeyTermRowProps {
  term: KeyTerm
  onSave: (value: string) => void
  isSaving?: boolean
  saveError?: string | null
}

export function KeyTermRow({ term, onSave, isSaving, saveError }: KeyTermRowProps) {
  const setTargetPage = useViewerStore((s) => s.setTargetPage)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(term.value)
  const [showWhy, setShowWhy] = useState(false)

  function handleSave() {
    const trimmed = draft.trim()
    if (!trimmed) return
    setIsEditing(false)
    if (trimmed !== term.value) onSave(trimmed)
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-grey-100 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-normal leading-[18px] text-grey-500">
          {term.term_name}
        </span>
        <div className="flex items-center gap-2">
          {term.is_custom && (
            <span className="rounded-sm border border-violet-200 bg-violet-50 px-2 py-0.5 text-[12px] font-medium leading-[18px] text-violet-700">
              Custom
            </span>
          )}
          {term.edited && (
            <span className="rounded-sm border border-blue-200 bg-blue-50 px-2 py-0.5 text-[12px] font-medium leading-[18px] text-blue-700">
              Edited
            </span>
          )}
          <ConfidenceBadge score={term.confidence_score} />
        </div>
      </div>

      {isEditing ? (
        <div className="flex flex-col gap-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[60px] rounded-md border border-blue-500 px-3 py-2 text-[16px] font-medium leading-[24px] text-grey-900 outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-md bg-blue-500 px-3 py-1.5 text-[12px] font-medium leading-[18px] text-white hover:bg-blue-600"
            >
              Save
            </button>
            <button
              onClick={() => {
                setDraft(term.value)
                setIsEditing(false)
              }}
              className="rounded-md border border-grey-100 px-3 py-1.5 text-[12px] font-medium leading-[18px] text-grey-900 hover:bg-grey-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="w-fit text-left text-[16px] font-medium leading-[24px] text-grey-900 hover:underline"
        >
          {term.value}
        </button>
      )}

      {saveError && (
        <p role="alert" className="text-[12px] font-normal leading-[18px] text-red-700">
          {saveError}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setTargetPage(term.page_number)}
          className="text-[12px] font-normal leading-[18px] text-blue-500 hover:text-blue-600"
        >
          Page {term.page_number}
        </button>
        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          className="text-[12px] font-normal leading-[18px] text-grey-500 hover:text-grey-900"
        >
          {showWhy ? 'Hide source' : 'Why?'}
        </button>
      </div>

      {showWhy && (
        <p className="rounded-md bg-grey-25 px-3 py-2 text-[12px] font-normal leading-[18px] text-grey-500">
          &ldquo;{term.source_sentence}&rdquo;
        </p>
      )}
    </div>
  )
}
