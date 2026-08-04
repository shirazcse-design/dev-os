'use client'

import { useViewerStore } from '@/stores/viewerStore'
import type { ChatMessage as ChatMessageType, ContextSource } from '@/types'

interface ChatMessageProps {
  message: ChatMessageType
}

const SOURCE_LABEL: Record<ContextSource, string> = {
  contract: 'From document',
  history: 'From conversation',
  both: 'From document + conversation',
}

function renderContent(content: string, onCitationClick: (page: number) => void) {
  const parts = content.split(/(\[Page \d+\])/g)
  return parts.map((part, i) => {
    const match = part.match(/^\[Page (\d+)\]$/)
    if (!match) return <span key={i}>{part}</span>
    const page = parseInt(match[1], 10)
    return (
      <button
        key={i}
        type="button"
        onClick={() => onCitationClick(page)}
        className="mx-0.5 font-medium text-blue-500 underline hover:text-blue-600"
      >
        {part}
      </button>
    )
  })
}

export function ChatMessage({ message }: ChatMessageProps) {
  const setTargetPage = useViewerStore((s) => s.setTargetPage)
  const isUser = message.role === 'user'

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 text-[16px] font-medium leading-[24px] ${
          isUser ? 'bg-blue-500 text-white' : 'border border-grey-100 bg-grey-25 text-grey-900'
        }`}
      >
        {isUser ? message.content : renderContent(message.content, setTargetPage)}
      </div>
      {!isUser && message.source_type && (
        <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[12px] font-medium leading-[18px] text-blue-700">
          {SOURCE_LABEL[message.source_type]}
        </span>
      )}
    </div>
  )
}
