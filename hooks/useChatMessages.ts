import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchJson } from '@/lib/api/fetchJson'
import type { ChatHistoryResponse, ChatMessage, ChatResponse } from '@/types'

/**
 * The API spec doesn't define an endpoint to look up an existing chat session by
 * contract_id, so we resolve it via a direct (RLS-scoped) Supabase query and only use
 * the Route Handler for message history / sending — matching the same pattern the spec
 * already uses for the chat_messages Realtime subscription.
 */
export function useChatMessages(contractId: string) {
  const queryClient = useQueryClient()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionResolved, setSessionResolved] = useState(false)

  async function resolveSession() {
    const supabase = createClient()
    const { data } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data?.id as string | undefined
  }

  useEffect(() => {
    let cancelled = false
    resolveSession().then((id) => {
      if (!cancelled) {
        setSessionId(id ?? null)
        setSessionResolved(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [contractId])

  const messagesQuery = useQuery({
    queryKey: ['chat-messages', sessionId],
    queryFn: () => fetchJson<ChatHistoryResponse>(`/api/chat/${sessionId}/messages`),
    enabled: !!sessionId,
  })

  useEffect(() => {
    if (!sessionId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`chat-messages-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage
          queryClient.setQueryData<ChatHistoryResponse>(['chat-messages', sessionId], (prev) => {
            if (!prev) return { messages: [incoming] }
            if (prev.messages.some((m) => m.id === incoming.id)) return prev
            return { messages: [...prev.messages, incoming] }
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, queryClient])

  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      fetchJson<ChatResponse>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, contract_id: contractId, message }),
      }),
    onMutate: async (message) => {
      const optimisticId = `optimistic-${Date.now()}`
      const optimisticMessage: ChatMessage = {
        id: optimisticId,
        session_id: sessionId ?? '',
        role: 'user',
        content: message,
        source_type: null,
        created_at: new Date().toISOString(),
      }
      queryClient.setQueryData<ChatHistoryResponse>(['chat-messages', sessionId], (prev) => ({
        messages: [...(prev?.messages ?? []), optimisticMessage],
      }))
      return { optimisticId }
    },
    onSuccess: (data, _message, context) => {
      if (data.session_id !== sessionId) setSessionId(data.session_id)
      queryClient.setQueryData<ChatHistoryResponse>(['chat-messages', data.session_id], (prev) => {
        const withoutOptimistic = (prev?.messages ?? []).filter(
          (m) => m.id !== context?.optimisticId
        )
        if (withoutOptimistic.some((m) => m.id === data.message.id)) {
          return { messages: withoutOptimistic }
        }
        return { messages: [...withoutOptimistic, data.message] }
      })
    },
    onError: async () => {
      // The server persists the user message (and creates the session, if this was the
      // first message) before attempting the OpenAI call — so even on failure a session
      // now exists. Adopt it so a retry doesn't create a duplicate session/message.
      if (!sessionId) {
        const id = await resolveSession()
        if (id) setSessionId(id)
      }
    },
  })

  return {
    sessionId,
    messages: messagesQuery.data?.messages ?? [],
    isLoadingHistory: !sessionResolved || (!!sessionId && messagesQuery.isLoading),
    sendMessage: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
    sendError: sendMutation.isError ? (sendMutation.error as Error).message : null,
    retrySend: () => {
      if (sendMutation.variables !== undefined) sendMutation.mutate(sendMutation.variables)
    },
  }
}
