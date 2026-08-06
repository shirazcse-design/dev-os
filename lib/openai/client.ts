import OpenAI from 'openai'

// Constructed lazily (not at module scope) so importing this module never throws during
// Next.js's build-time route analysis, which evaluates route modules before request-time
// env vars are guaranteed to be available.
let client: OpenAI | null = null

export function getOpenAIClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      organization: process.env.OPENAI_ORG_ID || undefined,
      // Set only in E2E (see tests/e2e/mockOpenAiServer.ts) to redirect calls to a
      // local fixture server instead of the real API — keeps E2E runs free, fast,
      // and deterministic. Never set outside test environments.
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    })
  }
  return client
}
