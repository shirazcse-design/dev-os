'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useContractDetail } from '@/hooks/useContractDetail'
import { useExtractContract } from '@/hooks/useExtractContract'
import { PdfViewer } from '@/components/results/PdfViewer'
import { TextViewerFallback } from '@/components/results/TextViewerFallback'
import { KeyTermsPanel } from '@/components/results/KeyTermsPanel'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { ProcessingSteps } from '@/components/upload/ProcessingSteps'
import { Disclaimer } from '@/components/shared/Disclaimer'
import { FeedbackWidget } from '@/components/results/FeedbackWidget'

type MobileTab = 'pdf' | 'terms' | 'chat'
type RightTab = 'terms' | 'chat'

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>()
  const contractId = params.id
  const { data, isLoading, isError } = useContractDetail(contractId)
  const extractMutation = useExtractContract()
  const [mobileTab, setMobileTab] = useState<MobileTab>('pdf')
  const [rightTab, setRightTab] = useState<RightTab>('terms')

  if (isLoading) {
    return (
      <main className="flex flex-1 flex-col gap-6 px-6 py-8 md:px-28">
        <Disclaimer />
        <p className="text-[16px] font-medium leading-[24px] text-grey-500">Loading contract…</p>
      </main>
    )
  }

  if (isError || !data) {
    return (
      <main className="flex flex-1 flex-col gap-6 px-6 py-8 md:px-28">
        <Disclaimer />
        <p className="text-[16px] font-medium leading-[24px] text-red-700">
          We couldn&apos;t find this contract.
        </p>
      </main>
    )
  }

  const { contract, key_terms, signed_pdf_url } = data

  if (contract.status !== 'completed') {
    return (
      <main className="flex flex-1 flex-col gap-6 px-6 py-8 md:px-28">
        <Disclaimer />
        <div className="flex flex-col gap-2">
          <h1 className="text-[24px] font-medium leading-[32px] text-grey-900">
            {contract.file_name}
          </h1>
          <span className="w-fit rounded-sm border border-grey-100 bg-grey-25 px-2 py-0.5 text-[12px] font-medium leading-[18px] text-grey-500">
            {contract.contract_type.toUpperCase()}
          </span>
        </div>

        <div className="max-w-md rounded-lg border border-grey-100 p-8">
          <ProcessingSteps status={contract.status === 'error' ? 'error' : 'processing'} />
          {contract.status === 'error' && (
            <div className="mt-6 flex flex-col gap-3">
              <p role="alert" className="text-[12px] font-normal leading-[18px] text-red-700">
                Something went wrong processing this contract. Try again in a few minutes.
              </p>
              <button
                onClick={() => extractMutation.mutate({ contractId, customTerms: [] })}
                disabled={extractMutation.isPending}
                className="w-fit rounded-md bg-blue-500 px-4 py-2 text-[16px] font-medium leading-[24px] text-white transition-colors duration-100 hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-grey-200"
              >
                {extractMutation.isPending ? 'Retrying…' : 'Retry Processing'}
              </button>
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-6 md:px-8">
      <Disclaimer />
      <div className="flex flex-col gap-2">
        <h1 className="text-[24px] font-medium leading-[32px] text-grey-900">
          {contract.file_name}
        </h1>
        <span className="w-fit rounded-sm border border-grey-100 bg-grey-25 px-2 py-0.5 text-[12px] font-medium leading-[18px] text-grey-500">
          {contract.contract_type.toUpperCase()} · {contract.page_count} pages
        </span>
      </div>

      {/* Mobile: tabbed single-pane layout below 768px */}
      <div className="flex flex-col gap-3 md:hidden">
        <div className="flex gap-2 border-b border-grey-100">
          {(['pdf', 'terms', 'chat'] as MobileTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`px-3 py-2 text-[12px] font-medium leading-[18px] ${
                mobileTab === tab
                  ? 'border-b-2 border-blue-500 text-blue-700'
                  : 'text-grey-500'
              }`}
            >
              {tab === 'pdf' ? 'Document' : tab === 'terms' ? 'Key Terms' : 'Chat'}
            </button>
          ))}
        </div>
        <div className="min-h-[400px] rounded-lg border border-grey-100">
          {mobileTab === 'pdf' &&
            (signed_pdf_url ? (
              <PdfViewer url={signed_pdf_url} />
            ) : (
              <TextViewerFallback contractText={contract.contract_text} />
            ))}
          {mobileTab === 'terms' && (
            <div className="p-4">
              <KeyTermsPanel contractId={contractId} keyTerms={key_terms} />
            </div>
          )}
          {mobileTab === 'chat' && <ChatPanel contractId={contractId} />}
        </div>
      </div>

      {/* Desktop: two-panel layout, ≥768px — fixed-height grid so each panel scrolls
          independently instead of the whole page scrolling both together. */}
      <div className="hidden min-h-0 gap-4 md:grid md:h-[calc(100vh_-_220px)] md:grid-cols-[1fr_420px]">
        <div className="min-h-0 overflow-y-auto rounded-lg border border-grey-100">
          {signed_pdf_url ? (
            <PdfViewer url={signed_pdf_url} />
          ) : (
            <TextViewerFallback contractText={contract.contract_text} />
          )}
        </div>
        <div className="flex min-h-0 flex-col rounded-lg border border-grey-100">
          <div className="flex shrink-0 gap-2 border-b border-grey-100 px-2 pt-2">
            {(['terms', 'chat'] as RightTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`px-3 py-2 text-[12px] font-medium leading-[18px] ${
                  rightTab === tab ? 'border-b-2 border-blue-500 text-blue-700' : 'text-grey-500'
                }`}
              >
                {tab === 'terms' ? 'Key Terms' : 'Chat'}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rightTab === 'terms' ? (
              <div className="flex flex-col gap-4 p-4">
                <KeyTermsPanel contractId={contractId} keyTerms={key_terms} />
                <FeedbackWidget contractId={contractId} />
              </div>
            ) : (
              <ChatPanel contractId={contractId} />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
