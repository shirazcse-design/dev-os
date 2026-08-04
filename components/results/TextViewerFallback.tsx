'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useViewerStore } from '@/stores/viewerStore'

interface TextViewerFallbackProps {
  contractText: string
}

export function TextViewerFallback({ contractText }: TextViewerFallbackProps) {
  const targetPage = useViewerStore((s) => s.targetPage)
  const sectionRefs = useRef<Record<number, HTMLElement | null>>({})

  const pages = useMemo(() => {
    const parts = contractText.split(/\[PAGE (\d+)\]/)
    // parts alternates: ['', '1', ' text...', '2', ' text...', ...]
    const result: { num: number; text: string }[] = []
    for (let i = 1; i < parts.length; i += 2) {
      result.push({ num: parseInt(parts[i], 10), text: parts[i + 1]?.trim() ?? '' })
    }
    return result
  }, [contractText])

  useEffect(() => {
    sectionRefs.current[targetPage]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [targetPage])

  return (
    <div className="flex flex-col gap-2 border-b border-grey-100 bg-grey-25 p-4">
      <p className="text-[12px] font-normal leading-[18px] text-grey-500">
        PDF preview unavailable — showing extracted text.
      </p>
      <div className="flex-1 overflow-y-auto rounded-md border border-grey-100 bg-white">
        {pages.map((page) => (
          <section
            key={page.num}
            id={`page-${page.num}`}
            ref={(el) => {
              sectionRefs.current[page.num] = el
            }}
            className={`border-b border-grey-50 p-4 transition-colors duration-200 ${
              targetPage === page.num ? 'bg-blue-50' : ''
            }`}
          >
            <p className="mb-2 text-[12px] font-normal leading-[18px] text-grey-500">
              Page {page.num}
            </p>
            <p className="whitespace-pre-wrap text-[16px] font-medium leading-[24px] text-grey-900">
              {page.text}
            </p>
          </section>
        ))}
      </div>
    </div>
  )
}
