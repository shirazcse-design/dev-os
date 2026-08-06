// Standalone fixture server started as a Playwright `webServer` entry (see
// playwright.config.ts). Implements just enough of the OpenAI chat completions
// endpoint to satisfy lib/openai/client.ts's `baseURL` override during E2E —
// keeps E2E runs free, fast, and deterministic instead of hitting the real API.
// Plain Node (no deps) so it needs no build step.
import { createServer } from 'node:http'

const PORT = process.env.MOCK_OPENAI_PORT || 4318

// Keyed to the fixture PDF's actual content — see tests/e2e/fixtures/e2e-nda.pdf
// and the term names in lib/prompts/termLibrary.ts.
const NDA_TERM_VALUES = {
  Parties: 'Acme Robotics, Inc. and Beacon Analytics, LLC',
  'Effective Date': 'January 15, 2026',
  'Confidentiality Obligations': 'Each party must hold Confidential Information in strict confidence.',
  'Permitted Disclosures': 'Disclosure is permitted only as required by law.',
  'Term & Duration': 'Three (3) years from the Effective Date.',
  'Governing Law': 'State of Delaware.',
  Jurisdiction: 'Courts located in Delaware.',
  'IP Ownership': 'Not found',
  'Non-Solicitation': 'Not found',
  'Breach & Remedy': 'The non-breaching party may seek injunctive relief and damages.',
}

function extractionResponse(systemPrompt) {
  const isNda = /Standard terms for NDA/i.test(systemPrompt)
  const values = isNda ? NDA_TERM_VALUES : {}
  const termNames = Object.keys(values)
  const terms = termNames.map((term_name) => ({
    term_name,
    value: values[term_name],
    page_number: 1,
    confidence_score: values[term_name] === 'Not found' ? 50 : 92,
    source_sentence: `Mock source sentence for ${term_name}.`,
  }))
  return JSON.stringify({ terms })
}

function chatResponse(systemPrompt, lastUserMessage) {
  // Deliberately keyed to a fixed trigger phrase the E2E test controls, rather
  // than trying to judge relevance ourselves — this mock verifies the app's
  // guardrail/UI handling of a "not found" answer, not real LLM judgment (the
  // latter is covered by the acceptance criteria in docs/specs/contract-chat.md
  // for the real, non-mocked model).
  if (/quantum teleportation clause/i.test(lastUserMessage)) {
    if (/Answer only from the conversation/i.test(systemPrompt)) {
      return 'I cannot find this in our conversation.'
    }
    return 'I cannot find this in the document.'
  }
  if (/Answer only from the conversation/i.test(systemPrompt)) {
    return 'Earlier in this conversation you asked about the agreement. [From conversation]'
  }
  if (/Answer from both/i.test(systemPrompt)) {
    return 'The document states the governing law is Delaware [Page 1], and as discussed earlier [From conversation].'
  }
  // Default: CONTRACT source.
  return 'Based on the contract, the governing law is the State of Delaware. [Page 1]'
}

const server = createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'not found' } }))
    return
  }

  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    let content = ''
    try {
      const parsed = JSON.parse(body)
      const messages = parsed.messages || []
      const systemPrompt = messages.find((m) => m.role === 'system')?.content || ''
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

      if (/contract analysis assistant/i.test(systemPrompt)) {
        content = extractionResponse(systemPrompt)
      } else {
        content = chatResponse(systemPrompt, lastUser)
      }
    } catch {
      content = 'Based on the contract, mock response. [Page 1]'
    }

    const completion = {
      id: 'mock-completion',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-4o',
      choices: [
        { index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(completion))
  })
})

server.listen(PORT, () => {
  console.log(`[mock-openai] listening on http://127.0.0.1:${PORT}`)
})
