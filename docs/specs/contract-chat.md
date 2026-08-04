# Spec: Contract Chat (Q&A)

Implements PRD Component F / FR-08 / FR-09 / US-007 / US-012.

## User Flow

1. User opens the "Chat" tab on the results page (`/contracts/[id]`).
2. Frontend fetches existing messages via `GET /api/chat/{session_id}/messages` if a session already exists for this contract, else shows an empty chat state.
3. User types a question, submits → `POST /api/chat` with `contract_id`, `session_id` (or `null` for first message), and the message text.
4. Route Handler creates a session if needed, loads prior conversation history (≤ 20 turns, ascending) **before** persisting the new user message, classifies the question into `CONTRACT` / `HISTORY` / `BOTH` (see Prompt Strategy), persists the user message, builds the context-matched prompt, calls GPT-4o, validates the response per the classification's guardrail, persists the assistant message tagged with its `source_type`, returns both.
5. Frontend renders the exchange; clicking the citation sets the PDF/text viewer's `targetPage`.
6. Reopening the contract later restores the full prior session (fetch on mount, no new session created unless the user sends a new message and none exists).

## DB Schema

`chat_sessions`, `chat_messages` — see `docs/specs/supabase-schema.sql`.

## DB Tasks

- Create one `chat_sessions` row per contract on the first message (not one per browser session — a contract has at most one ongoing chat session at MVP, matching PRD's "persistent chat history per contract" requirement, US-012).
- Fetch prior conversation history **before** inserting the new user message. If fetched after, the query would include the just-inserted message, and the classifier would always see it as part of history rather than as the new question — misclassifying every turn.
- Insert a `chat_messages` row for the user's message immediately after history is loaded (and before calling OpenAI), so it's never lost even if the OpenAI call fails.
- Insert a second `chat_messages` row for the assistant's response only on success, tagged with the `source_type` (`contract` | `history` | `both`) used to answer it. User message rows leave `source_type` null.

## API Routes

### `POST /api/chat`
- **Auth:** Required; `contract_id` must belong to the caller.
- **Request:**
```json
{ "session_id": "uuid | null", "contract_id": "uuid", "message": "What happens if I breach the NDA?" }
```
- **Response `200`:**
```json
{
  "session_id": "uuid",
  "message": {
    "id": "uuid", "role": "assistant",
    "content": "If you breach the NDA, the non-breaching party may seek injunctive relief and damages [Page 6].",
    "source_type": "contract",
    "created_at": "2026-08-01T12:00:00Z"
  }
}
```
- **Validation:** `message` non-empty, max 2000 chars; contract must have `status = 'completed'` (chat requires `contract_text`, which exists regardless of extraction status, but UX-wise chat is only exposed once results are shown).
- **Errors:** `404` (`CONTRACT_NOT_FOUND` or `SESSION_NOT_FOUND` — ownership verified server-side via `lib/security/chatSecurity.ts`, not RLS alone), `400` (`PROMPT_INJECTION` — message matched a known injection pattern, rejected before any OpenAI call), `409` (`CONTRACT_NOT_READY` — contract `status !== 'completed'`), `429` (`RATE_LIMITED`, 30/minute per `lib/security/rateLimiter.ts`), `502` (`OPENAI_UNAVAILABLE` — user message remains persisted, assistant message omitted).

**Handler logic (`app/api/chat/route.ts`):**
```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { session_id, contract_id, message } = await req.json()
  if (!message || message.length > 2000) return badRequest('INVALID_MESSAGE', 'Message must be 1-2000 characters.')

  const { data: contract } = await supabase
    .from('contracts')
    .select('id, contract_text')
    .eq('id', contract_id)
    .eq('user_id', user.id)
    .single()
  if (!contract) return notFound('CONTRACT_NOT_FOUND', 'Contract not found.')

  const rateLimitOk = await checkAndIncrementRateLimit(supabase, user.id, 'chat', RATE_LIMIT_CHAT_PER_HOUR)
  if (!rateLimitOk) return tooManyRequests('RATE_LIMITED', 'Chat rate limit exceeded. Try again later.')

  let sessionId = session_id
  if (!sessionId) {
    const { data: session } = await supabase
      .from('chat_sessions')
      .insert({ contract_id, user_id: user.id })
      .select('id')
      .single()
    sessionId = session!.id
  }

  // Load prior history BEFORE inserting the new user message — see DB Tasks above.
  const { data: priorHistoryDesc } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(20)
  const priorHistory = (priorHistoryDesc ?? []).reverse()

  await supabase.from('chat_messages').insert({ session_id: sessionId, role: 'user', content: message })

  try {
    const { reply, source } = await getChatCompletionWithRetry({
      contractText: contract.contract_text,
      priorHistory,
      newMessage: message,
    })
    const { data: assistantMessage } = await supabase
      .from('chat_messages')
      .insert({ session_id: sessionId, role: 'assistant', content: reply, source_type: source })
      .select()
      .single()

    return NextResponse.json({ session_id: sessionId, message: assistantMessage })
  } catch {
    return badGateway('OPENAI_UNAVAILABLE', 'Chat is temporarily unavailable. Your message was saved — try again shortly.')
  }
}
```

### `GET /api/chat/{session_id}/messages`
- **Auth:** Required; session's `user_id` must match caller.
- **Response `200`:** `{ "messages": [ { "id", "role", "content", "created_at" }, ... ] }` (ascending, ≤ 200).
- **Errors:** `404` (`SESSION_NOT_FOUND`).

## Prompt Strategy — Conversation Memory Layer

Every question is classified into one of three context types before a prompt is built, so the assistant stops defaulting to a contract-only system prompt for questions that are actually about the conversation.

**1. Classify** (`classifyQuery`, `lib/prompts/chat.ts`) — regex-based, using the new message text and whether prior history exists (prior turns only, loaded before the new message is saved — see DB Tasks):
- References the conversation itself ("you said", "earlier", "what did I ask") **and** the document → `BOTH`
- References only the conversation, and prior history exists → `HISTORY`
- Otherwise → `CONTRACT` (the default)

**2. Retrieve** — context sent to the model depends on the classification:
| Source | Contract text | History depth |
|---|---|---|
| `CONTRACT` | included | last 10 turns |
| `HISTORY` | excluded | last 20 turns |
| `BOTH` | included | last 10 turns |

**3. Respond** — system prompt matched to the source:
| Source | System prompt |
|---|---|
| `CONTRACT` | "Answer only from the contract. Cite [Page X]." |
| `HISTORY` | "Answer only from the conversation. End with [From conversation]." |
| `BOTH` | "Answer from both. Attribute each fact to its source." |

**4. Attribute** — the assistant message is persisted with `source_type` set to the classification, and the UI (`ChatMessage.tsx`) renders a small badge ("From document" / "From conversation" / "From document + conversation") so the user knows where the answer came from.

`lib/prompts/chat.ts`:
```ts
const HISTORY_PATTERN = /\b(you (said|mentioned|told me)|earlier|before|previous(ly)?|what did (i|we) (ask|say|talk about)|our conversation|this conversation|last (question|message|answer))\b/i
const CONTRACT_PATTERN = /\b(contract|document|agreement|clause|section|page \d+|nda|msa)\b/i

function classifyQuery(message: string, hasHistory: boolean): 'contract' | 'history' | 'both' {
  const referencesHistory = hasHistory && HISTORY_PATTERN.test(message)
  const referencesContract = CONTRACT_PATTERN.test(message)
  if (referencesHistory && referencesContract) return 'both'
  if (referencesHistory) return 'history'
  return 'contract'
}

export async function getChatCompletionWithRetry(input: {
  contractText: string
  priorHistory: { role: 'user' | 'assistant'; content: string }[]
  newMessage: string
}) {
  const source = classifyQuery(input.newMessage, input.priorHistory.length > 0)
  const turnLimit = source === 'history' ? 20 : 10
  const turns = [...input.priorHistory.slice(-(turnLimit - 1)), { role: 'user' as const, content: input.newMessage }]

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPTS[source] },
    ...(source !== 'history' ? [{ role: 'system' as const, content: `CONTRACT TEXT:\n${input.contractText}` }] : []),
    ...turns,
  ]

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      messages,
      temperature: 0.4,
      max_tokens: 1000,
    })
  )

  const reply = response.choices[0].message.content!
  const passes = source === 'history'
    ? /\[From conversation\]/.test(reply) || /cannot find this in our conversation/i.test(reply)
    : /\[Page \d+\]/.test(reply) || /cannot find this in the document/i.test(reply)
  if (!passes) {
    // Missing the mandatory source attribution and not a valid "not found" response — treat as a guardrail failure.
    throw new Error('Response missing required source attribution')
  }
  return { reply, source }
}
```

**Why history must load before the save (critical):** if the new user message is inserted first and history is then queried, the fetched "history" array includes the new message. The classifier would then always be scanning a blob that contains the current question mixed with past turns, rather than classifying the current question against clean prior context — breaking `HISTORY`/`BOTH` detection on the very message that should trigger it.

## State Management

- `useChatMessages(sessionId)` — TanStack Query, keyed `['chat', sessionId]`.
- Supabase Realtime subscription on `chat_messages` filtered by `session_id`, pushing new rows into the TanStack Query cache — smooths over the latency between sending a message and the assistant reply landing.
- Zustand holds only the chat input draft (`chatDraftStore`), cleared on send.

## Component Spec

- `components/chat/ChatPanel.tsx` — message list with `aria-live="polite"` region, text input, send button (disabled while a response is pending).
- `components/chat/ChatMessage.tsx` — right-aligned user bubble / left-aligned assistant bubble; assistant messages render the `[Page X]` substring as a clickable link that calls `viewerStore.setTargetPage(X)`.

## Design

Chat bubble spacing/color per `docs/design.md` component patterns; assistant bubble uses a distinct but accessible-contrast background from user bubble.

## Edge Cases

- Question about a topic absent from the document → model returns "I cannot find this in the document." — this is a valid, expected response, not an error (automated regression test required, see `docs/engineering/engineering-doc.md` §13).
- Question about the conversation with no prior turns (first message in a session) → `hasHistory` is false, so classification falls back to `CONTRACT` regardless of phrasing — there is nothing to reference yet.
- OpenAI call fails → user message is already persisted; frontend shows a "Retry" action on that message bubble without requiring re-typing.
- Response missing the mandatory source attribution (`[Page X]` for `CONTRACT`/`BOTH`, `[From conversation]` for `HISTORY`) and not a valid "not found" response → treated as a guardrail failure, triggers the same retry/error path as an OpenAI outage (never shown to the user un-attributed).
- User sends a message before the contract has finished processing → blocked client-side (chat tab disabled until `status = 'completed'`).
- Very long conversation (approaching 200 messages) → oldest messages remain in the DB but are simply not included beyond the 20-turn retrieval window; PRD accepts this ceiling as by-design.

## Acceptance Criteria

- [ ] (US-007) A chat message about content present in the document receives a response within ≤ 15s P95, containing a `[Page X]` citation matching a real page in the contract.
- [ ] (US-007) A chat message about content absent from the document receives the exact response "I cannot find this in the document." (or a response containing that phrase) rather than a fabricated answer — verified by an automated hallucination-regression test per `engineering-doc.md` §13.
- [ ] Every assistant response either contains its required source attribution (`[Page X]` for `CONTRACT`/`BOTH`, `[From conversation]` for `HISTORY`) or a valid "not found" phrase — a response with neither is never shown to the user; it is retried/surfaced as a guardrail failure instead.
- [ ] The user's message is persisted to `chat_messages` before the OpenAI call is made, so it is never lost even if the OpenAI call fails.
- [ ] Prior conversation history is loaded from the DB before the new user message is inserted, so the classifier never sees the new message as part of history.
- [ ] A question referencing only the conversation ("what did you say earlier about X?") with prior history present is classified `HISTORY`, sent no contract text, and answered without fabricating a page citation.
- [ ] A question referencing both the conversation and the document is classified `BOTH` and the response attributes each fact to its source.
- [ ] The UI shows a source badge on every assistant message matching its persisted `source_type`.
- [ ] (US-012) Reloading the results page and reopening the Chat tab restores the full prior message history for that contract in original order, without creating a duplicate session.
- [ ] Exceeding `RATE_LIMIT_CHAT_PER_HOUR` returns `429 RATE_LIMITED` before any OpenAI call is made.
- [ ] An OpenAI failure on `/api/chat` returns `502`, the user's message remains visible in the chat log, and a "Retry" action is available without requiring re-typing.
- [ ] The chat tab/input is disabled while `contracts.status !== 'completed'`.
