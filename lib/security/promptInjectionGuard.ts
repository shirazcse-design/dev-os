// Keyword/pattern detection for direct prompt-injection attempts in user-supplied
// text that will be sent to the LLM (chat messages, custom term names). This is a
// blocklist, not a substitute for keeping untrusted content (contract text) out of
// the system role — see lib/prompts/chat.ts and lib/prompts/extraction.ts, which
// always send contract text as a `user`-role message and instruct the model to
// treat it as untrusted, so injection attempts embedded in an uploaded document
// are contained even when this guard doesn't fire on them.
const INJECTION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /ignore\s+(all\s+|the\s+)?(previous|prior|above)\s+instructions?/i, label: 'ignore previous instructions' },
  { pattern: /override\s+(your\s+)?(rules|instructions|guidelines|system prompt)/i, label: 'override your rules' },
  { pattern: /reveal\s+(your\s+|the\s+)?system\s+prompt/i, label: 'reveal system prompt' },
  { pattern: /print\s+(your\s+|the\s+)?(instructions|system prompt)/i, label: 'print your instructions' },
  { pattern: /expose\s+(the\s+)?env(ironment)?\s+variables?/i, label: 'expose env variables' },
  { pattern: /show\s+(me\s+)?(the\s+)?api\s+keys?/i, label: 'show API keys' },
  { pattern: /you\s+are\s+now\s+a\b/i, label: 'you are now a' },
  { pattern: /\bact\s+as\b/i, label: 'act as' },
  { pattern: /pretend\s+(you('re| are)|to\s+be)\b/i, label: 'pretend you are' },
  { pattern: /\bjailbreak\b/i, label: 'jailbreak' },
  { pattern: /\bDAN\s+mode\b/i, label: 'DAN mode' },
  { pattern: /developer\s+mode/i, label: 'developer mode' },
]

export type SanitizeResult = { safe: true } | { safe: false; matchedLabel: string }

/**
 * Call on every piece of user-authored text before it reaches an LLM call
 * (chat messages, custom key-term names). Does not mutate the input — the
 * caller must reject the request (400 PROMPT_INJECTION) rather than send a
 * "cleaned" version, since a partial strip can still leave an effective
 * injection behind.
 */
export function sanitizeForLLM(text: string): SanitizeResult {
  for (const { pattern, label } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, matchedLabel: label }
    }
  }
  return { safe: true }
}
