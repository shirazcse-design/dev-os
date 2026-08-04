interface SummaryCardsProps {
  total: number
  totals?: { nda: number; msa: number }
}

export function SummaryCards({ total, totals }: SummaryCardsProps) {
  const cards = [
    { label: 'Total contracts', value: total },
    { label: 'NDAs', value: totals?.nda ?? 0 },
    { label: 'MSAs', value: totals?.msa ?? 0 },
  ]

  return (
    <div className="flex flex-wrap gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex min-w-[160px] flex-1 flex-col gap-2 rounded-lg border border-grey-100 bg-grey-25 p-6"
        >
          <span className="text-[12px] font-normal leading-[18px] text-grey-500">
            {card.label}
          </span>
          <span className="text-[24px] font-medium leading-[32px] text-grey-900">
            {card.value}
          </span>
        </div>
      ))}
    </div>
  )
}
