import { create } from 'zustand'

interface ChatDraftState {
  draft: string
  setDraft: (draft: string) => void
  clear: () => void
}

export const useChatDraftStore = create<ChatDraftState>((set) => ({
  draft: '',
  setDraft: (draft) => set({ draft }),
  clear: () => set({ draft: '' }),
}))
