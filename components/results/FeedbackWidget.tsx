'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api/fetchJson'
import type { FeedbackRating, FeedbackResponse } from '@/types'

interface FeedbackWidgetProps {
  contractId: string
}

export function FeedbackWidget({ contractId }: FeedbackWidgetProps) {
  const [rating, setRating] = useState<FeedbackRating | null>(null)
  const [comment, setComment] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      fetchJson<FeedbackResponse>('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: contractId, rating, comment: comment || undefined }),
      }),
  })

  if (mutation.isSuccess) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-[12px] font-normal leading-[18px] text-green-700">
        Thanks for the feedback!
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-grey-100 p-4">
      <h3 className="text-[16px] font-medium leading-[24px] text-grey-900">
        Was this review helpful?
      </h3>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setRating('up')}
          aria-pressed={rating === 'up'}
          className={`rounded-md border px-3 py-2 text-[16px] transition-colors duration-100 ${
            rating === 'up'
              ? 'border-green-500 bg-green-50'
              : 'border-grey-100 hover:bg-grey-50'
          }`}
        >
          👍
        </button>
        <button
          type="button"
          onClick={() => setRating('down')}
          aria-pressed={rating === 'down'}
          className={`rounded-md border px-3 py-2 text-[16px] transition-colors duration-100 ${
            rating === 'down' ? 'border-red-500 bg-red-50' : 'border-grey-100 hover:bg-grey-50'
          }`}
        >
          👎
        </button>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        placeholder="Anything we missed? (optional)"
        className="min-h-[60px] rounded-md border border-grey-100 px-3 py-2 text-[12px] font-normal leading-[18px] text-grey-900 outline-none focus:border-blue-500"
      />
      {mutation.isError && (
        <p role="alert" className="text-[12px] font-normal leading-[18px] text-red-700">
          Couldn&apos;t submit feedback — try again.
        </p>
      )}
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={!rating || mutation.isPending}
        className="w-fit rounded-md bg-blue-500 px-4 py-2 text-[12px] font-medium leading-[18px] text-white transition-colors duration-100 hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-grey-200"
      >
        {mutation.isPending ? 'Submitting…' : 'Submit'}
      </button>
    </div>
  )
}
