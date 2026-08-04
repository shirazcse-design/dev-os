/**
 * Fast pre-flight token estimate (chars/4 heuristic) used to gate uploads before any
 * OpenAI call. Not authoritative — OpenAI's own tokenizer is the source of truth at
 * call time; this exists only to reject obviously-too-long contracts early.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
