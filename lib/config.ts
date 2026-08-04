// Env-driven numeric limits — see .env.example. Never hardcode these in routes so they
// can be re-tuned post-launch without a code change.

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  const parsed = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

export const MAX_UPLOAD_SIZE_MB = envInt('MAX_UPLOAD_SIZE_MB', 10)
export const MAX_PAGE_COUNT = envInt('MAX_PAGE_COUNT', 20)
export const MAX_CONTRACT_TOKENS = envInt('MAX_CONTRACT_TOKENS', 15000)
export const MAX_CUSTOM_TERMS = envInt('MAX_CUSTOM_TERMS', 5)
// Rate limits are now fixed policy constants in lib/security/rateLimiter.ts
// (part of the security foundation) rather than env-tunable — see
// docs/security/security-plan.md for why.
export const MAX_CHAT_HISTORY = envInt('MAX_CHAT_HISTORY', 100)
