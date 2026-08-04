'use client'

import { useRef, useState, type DragEvent } from 'react'

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024

interface UploadDropzoneProps {
  file: File | null
  onFileSelected: (file: File) => void
  disabled?: boolean
  uploading?: boolean
}

export function UploadDropzone({ file, onFileSelected, disabled, uploading }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  function validateAndSelect(candidate: File | undefined) {
    if (!candidate) return
    if (candidate.type !== 'application/pdf') {
      setClientError('Only PDF files are supported.')
      return
    }
    if (candidate.size > MAX_UPLOAD_SIZE_BYTES) {
      setClientError('File must be under 10MB.')
      return
    }
    setClientError(null)
    onFileSelected(candidate)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    validateAndSelect(e.dataTransfer.files[0])
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-colors duration-150 ${
          disabled
            ? 'cursor-not-allowed border-grey-100 bg-grey-25 opacity-60'
            : isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-grey-200 bg-grey-25 hover:border-grey-300'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          disabled={disabled}
          onChange={(e) => validateAndSelect(e.target.files?.[0])}
        />
        {file ? (
          <>
            <p className="text-[16px] font-medium leading-[24px] text-grey-900">{file.name}</p>
            <p className="text-[12px] font-normal leading-[18px] text-grey-500">
              {(file.size / (1024 * 1024)).toFixed(1)} MB — click or drop to replace
            </p>
          </>
        ) : (
          <>
            <p className="text-[16px] font-medium leading-[24px] text-grey-900">
              Drag and drop a PDF, or click to browse
            </p>
            <p className="text-[12px] font-normal leading-[18px] text-grey-500">
              PDF only, up to 10MB, 20 pages
            </p>
          </>
        )}
        {uploading && (
          <p className="text-[12px] font-normal leading-[18px] text-blue-500">Uploading…</p>
        )}
      </div>
      {clientError && (
        <p role="alert" className="text-[12px] font-normal leading-[18px] text-red-700">
          {clientError}
        </p>
      )}
    </div>
  )
}
