'use client'

import { useRouter } from 'next/navigation'
import { useUploadWizardStore } from '@/stores/uploadWizardStore'
import { useUploadContract } from '@/hooks/useUploadContract'
import { useExtractContract } from '@/hooks/useExtractContract'
import { UploadDropzone } from '@/components/upload/UploadDropzone'
import { TermPreviewList } from '@/components/upload/TermPreviewList'
import { CustomTermInput } from '@/components/upload/CustomTermInput'
import { ProcessingSteps } from '@/components/upload/ProcessingSteps'
import { STANDARD_TERMS } from '@/lib/prompts/termLibrary'
import type { ContractType } from '@/types'

const CONTRACT_TYPE_OPTIONS: { value: ContractType; label: string }[] = [
  { value: 'nda', label: 'NDA — Non-Disclosure Agreement' },
  { value: 'msa', label: 'MSA — Master Service Agreement' },
]

export default function UploadPage() {
  const router = useRouter()
  const {
    step,
    contractType,
    file,
    contractId,
    standardTerms,
    customTerms,
    setContractType,
    setFile,
    setUploadResult,
    addCustomTerm,
    removeCustomTerm,
    setStep,
    reset,
  } = useUploadWizardStore()

  const uploadMutation = useUploadContract()
  const extractMutation = useExtractContract()

  async function handleUpload() {
    if (!file || !contractType) return
    const result = await uploadMutation.mutateAsync({ file, contractType })
    setUploadResult(result.contract_id, result.standard_terms)
  }

  async function handleProcess() {
    if (!contractId) return
    setStep('processing')
    try {
      await extractMutation.mutateAsync({ contractId, customTerms })
      const targetId = contractId
      reset()
      router.push(`/contracts/${targetId}`)
    } catch {
      setStep('preview')
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-12 md:px-0">
      <div className="flex flex-col gap-2">
        <h1 className="text-[24px] font-medium leading-[32px] text-grey-900">
          Review a contract
        </h1>
        <p className="text-[12px] font-normal leading-[18px] text-grey-500">
          Upload a PDF and we&apos;ll extract the key terms in minutes.
        </p>
      </div>

      {step === 'processing' ? (
        <section className="flex flex-col gap-6 rounded-lg border border-grey-100 p-8">
          <ProcessingSteps status={extractMutation.isError ? 'error' : 'processing'} />
          {extractMutation.isError && (
            <div className="flex flex-col gap-3">
              <p role="alert" className="text-[12px] font-normal leading-[18px] text-red-700">
                {extractMutation.error instanceof Error
                  ? extractMutation.error.message
                  : 'Extraction failed. Try again in a few minutes.'}
              </p>
              <button
                onClick={handleProcess}
                className="w-fit rounded-md bg-blue-500 px-4 py-2 text-[16px] font-medium leading-[24px] text-white transition-colors duration-100 hover:bg-blue-600"
              >
                Try again
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-[16px] font-medium leading-[24px] text-grey-900">
              1. Contract type
            </h2>
            <div className="flex flex-wrap gap-3">
              {CONTRACT_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={step === 'preview'}
                  onClick={() => setContractType(option.value)}
                  className={`rounded-md border px-4 py-3 text-left text-[16px] font-medium leading-[24px] transition-colors duration-100 ${
                    contractType === option.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-grey-100 bg-white text-grey-900 hover:border-grey-200'
                  } disabled:cursor-not-allowed`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          {contractType && step === 'select-type' && (
            <section className="flex flex-col gap-4">
              <h2 className="text-[16px] font-medium leading-[24px] text-grey-900">
                2. Upload PDF
              </h2>
              <UploadDropzone
                file={file}
                onFileSelected={setFile}
                uploading={uploadMutation.isPending}
              />
              {uploadMutation.isError && (
                <p role="alert" className="text-[12px] font-normal leading-[18px] text-red-700">
                  {uploadMutation.error instanceof Error
                    ? uploadMutation.error.message
                    : 'Upload failed. Please try again.'}
                </p>
              )}
              <button
                onClick={handleUpload}
                disabled={!file || uploadMutation.isPending}
                className="w-fit rounded-md bg-blue-500 px-6 py-3 text-[16px] font-medium leading-[24px] text-white transition-colors duration-100 hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-grey-200"
              >
                {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
              </button>

              <div className="flex flex-col gap-3 rounded-lg border border-grey-100 bg-grey-25 p-6">
                <h3 className="text-[12px] font-normal leading-[18px] text-grey-500">
                  We&apos;ll extract these standard terms for a {contractType.toUpperCase()}
                </h3>
                <TermPreviewList standardTerms={STANDARD_TERMS[contractType]} />
              </div>
            </section>
          )}

          {step === 'preview' && (
            <section className="flex flex-col gap-6">
              <div className="flex flex-col gap-4">
                <h2 className="text-[16px] font-medium leading-[24px] text-grey-900">
                  3. Confirm key terms
                </h2>
                <TermPreviewList standardTerms={standardTerms} customTerms={customTerms} />
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="text-[16px] font-medium leading-[24px] text-grey-900">
                  Add custom terms (optional, up to 5)
                </h3>
                <CustomTermInput
                  customTerms={customTerms}
                  onAdd={addCustomTerm}
                  onRemove={removeCustomTerm}
                />
              </div>

              <button
                onClick={handleProcess}
                className="w-fit rounded-md bg-blue-500 px-6 py-3 text-[16px] font-medium leading-[24px] text-white transition-colors duration-100 hover:bg-blue-600"
              >
                Process Contract
              </button>
            </section>
          )}
        </>
      )}
    </main>
  )
}
