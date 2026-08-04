interface TermPreviewListProps {
  standardTerms: string[]
  customTerms?: string[]
}

export function TermPreviewList({ standardTerms, customTerms = [] }: TermPreviewListProps) {
  return (
    <div className="flex flex-col gap-2">
      {standardTerms.map((term) => (
        <div
          key={term}
          className="flex items-center justify-between rounded-md border border-grey-100 bg-white px-3 py-2"
        >
          <span className="text-[16px] font-medium leading-[24px] text-grey-900">{term}</span>
        </div>
      ))}
      {customTerms.map((term) => (
        <div
          key={term}
          className="flex items-center justify-between rounded-md border border-violet-200 bg-violet-50 px-3 py-2"
        >
          <span className="text-[16px] font-medium leading-[24px] text-grey-900">{term}</span>
          <span className="rounded-sm border border-violet-200 bg-violet-50 px-2 py-0.5 text-[12px] font-medium leading-[18px] text-violet-700">
            Custom
          </span>
        </div>
      ))}
    </div>
  )
}
