import type { ContractStatus } from '@/types'

const STEPS = ['Extracting text', 'Analysing with AI', 'Compiling results'] as const

interface ProcessingStepsProps {
  status: ContractStatus
}

export function ProcessingSteps({ status }: ProcessingStepsProps) {
  // 'uploaded'/'processing' both render while the extraction call is in flight —
  // text extraction always completed synchronously during upload, so step 1 is done
  // the instant this component mounts.
  const activeIndex = status === 'completed' ? STEPS.length : status === 'error' ? -1 : 1

  return (
    <div className="flex flex-col gap-4">
      {STEPS.map((label, index) => {
        const done = index < activeIndex
        const active = index === activeIndex
        return (
          <div key={label} className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-medium leading-[18px] ${
                done
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : active
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-grey-100 bg-grey-25 text-grey-400'
              }`}
            >
              {done ? '✓' : index + 1}
            </span>
            <span
              className={`text-[16px] font-medium leading-[24px] ${
                done || active ? 'text-grey-900' : 'text-grey-400'
              }`}
            >
              {label}
              {active && '…'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
