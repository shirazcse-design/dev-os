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
    })
  }
  return client
}
