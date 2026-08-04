interface ConfidenceBadgeProps {
  score: number
}

export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
  const tier =
    score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low'

  const styles = {
    high: 'border-green-200 bg-green-50 text-green-700',
    medium: 'border-yellow-200 bg-yellow-50 text-yellow-800',
    low: 'border-red-200 bg-red-50 text-red-700',
  }[tier]

  const rounded = Math.round(score)

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[12px] font-medium leading-[18px] ${styles}`}
      title={
        tier === 'low'
          ? 'Low confidence — please verify this value against the source document.'
          : undefined
      }
    >
      {tier === 'low' && <span aria-hidden="true">⚠️</span>}
      {rounded}% confidence
    </span>
  )
}
