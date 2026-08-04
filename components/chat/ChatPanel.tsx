'use client'

import { useRef, type FormEvent } from 'react'
import { useChatMessages } from '@/hooks/useChatMessages'
import { useChatDraftStore } from '@/stores/chatDraftStore'
import { ChatMessage } from '@/components/chat/ChatMessage'

interface ChatPanelProps {
  contractId: string
  disabled?: boolean
}

export function ChatPanel({ contractId, disabled }: ChatPanelProps) {
  const { messages, isLoadingHistory, sendMessage, isSending, sendError, retrySend } =
    useChatMessages(contractId)
  const { draft, setDraft, clear } = useChatDraftStore()
  const listRef = useRef<HTMLDivElement>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed || disabled) return
    clear()
    try {
      await sendMessage(trimmed)
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    } catch {
      // sendError below surfaces the failure; message stays visible via optimistic cache.
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={listRef}
        aria-live="polite"
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        {isLoadingHistory ? (
          <p className="text-[12px] font-normal leading-[18px] text-grey-500">Loading chat…</p>
        ) : messages.length === 0 ? (
          <p className="text-[12px] font-normal leading-[18px] text-grey-500">
            Ask a question about this contract.
          </p>
        ) : (
          messages.map((message) => <ChatMessage key={message.id} message={message} />)
        )}
      </div>

      {sendError && (
        <div className="flex items-center justify-between gap-2 border-t border-grey-100 px-4 py-2">
          <p role="alert" className="text-[12px] font-normal leading-[18px] text-red-700">
            {sendError}
          </p>
          <button
            type="button"
            onClick={retrySend}
            className="shrink-0 rounded-md border border-grey-100 px-3 py-1 text-[12px] font-medium leading-[18px] text-grey-900 hover:bg-grey-50"
          >
            Retry
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-grey-100 p-4">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          placeholder={
            disabled ? 'Chat is available once processing completes' : 'Ask a question…'
          }
          maxLength={2000}
          className="flex-1 rounded-md border border-grey-100 px-3 py-2 text-[16px] font-medium leading-[24px] text-grey-900 outline-none transition-colors duration-100 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-grey-25"
        />
        <button
          type="submit"
          disabled={disabled || isSending || !draft.trim()}
          className="rounded-md bg-blue-500 px-4 py-2 text-[16px] font-medium leading-[24px] text-white transition-colors duration-100 hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-grey-200"
        >
          {isSending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
