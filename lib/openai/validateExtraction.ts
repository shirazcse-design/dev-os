import { z } from 'zod'
import type { ExtractedTerm } from '@/types'

const extractedTermSchema = z.object({
  term_name: z.string().min(1),
  value: z.string().min(1),
  page_number: z.number().int().positive(),
  confidence_score: z.number().min(0).max(100),
  source_sentence: z.string().min(1),
})

const extractionResponseSchema = z.object({
  terms: z.array(extractedTermSchema),
})

export function parseAndValidateTerms(raw: string): ExtractedTerm[] {
  const parsed = extractionResponseSchema.parse(JSON.parse(raw))
  return parsed.terms
}
