'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useViewerStore } from '@/stores/viewerStore'

interface PdfViewerProps {
  url: string
}

export function PdfViewer({ url }: PdfViewerProps) {
  const targetPage = useViewerStore((s) => s.targetPage)
  const zoom = useViewerStore((s) => s.zoom)
  const setZoom = useViewerStore((s) => s.setZoom)
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [flashPage, setFlashPage] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const pdfjsLib = await import('pdfjs-dist')
      // Served as a static file (copied from node_modules at install time — see
      // package.json "postinstall") rather than bundled via `new URL(..., import.meta.url)`:
      // Next's production Terser pass can't minify the worker's own top-level
      // `import.meta` usage when webpack treats it as a JS asset module.
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      try {
        const pdf = await pdfjsLib.getDocument({ url }).promise
        if (cancelled) return
        setDoc(pdf)
        setNumPages(pdf.numPages)
      } catch {
        if (!cancelled) setError('Could not load the PDF preview.')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [url])

  useEffect(() => {
    if (!doc) return
    pageRefs.current[targetPage]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setFlashPage(targetPage)
    const t = setTimeout(() => setFlashPage(null), 1200)
    return () => clearTimeout(t)
  }, [targetPage, doc])

  if (error) {
    return <p className="p-4 text-[12px] font-normal leading-[18px] text-red-700">{error}</p>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-grey-100 px-4 py-2">
        <button
          type="button"
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          aria-label="Zoom out"
          className="rounded-md border border-grey-100 px-2 py-1 text-[12px] font-medium leading-[18px] text-grey-900 hover:bg-grey-50"
        >
          −
        </button>
        <span className="text-[12px] font-normal leading-[18px] text-grey-500">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom(Math.min(2.5, zoom + 0.25))}
          aria-label="Zoom in"
          className="rounded-md border border-grey-100 px-2 py-1 text-[12px] font-medium leading-[18px] text-grey-900 hover:bg-grey-50"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto bg-grey-25 p-4">
        <div className="flex flex-col items-center gap-4">
          {doc &&
            Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <PdfPageCanvas
                key={pageNum}
                doc={doc}
                pageNum={pageNum}
                scale={zoom}
                highlighted={flashPage === pageNum}
                containerRefCallback={(el) => {
                  pageRefs.current[pageNum] = el
                }}
              />
            ))}
        </div>
      </div>
    </div>
  )
}

function PdfPageCanvas({
  doc,
  pageNum,
  scale,
  highlighted,
  containerRefCallback,
}: {
  doc: PDFDocumentProxy
  pageNum: number
  scale: number
  highlighted: boolean
  containerRefCallback: (el: HTMLDivElement | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    async function render() {
      const page = await doc.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, viewport }).promise
    }
    render()
    return () => {
      cancelled = true
    }
  }, [doc, pageNum, scale])

  return (
    <div
      ref={containerRefCallback}
      id={`pdf-page-${pageNum}`}
      className={`rounded-md border transition-colors duration-200 ${
        highlighted ? 'border-blue-500 ring-2 ring-blue-200' : 'border-grey-100'
      }`}
    >
      <canvas ref={canvasRef} />
    </div>
  )
}
