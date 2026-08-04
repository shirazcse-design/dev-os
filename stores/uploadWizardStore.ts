import { create } from 'zustand'
import type { ContractType } from '@/types'

export type UploadWizardStep = 'select-type' | 'upload' | 'preview' | 'processing'

interface UploadWizardState {
  step: UploadWizardStep
  contractType: ContractType | null
  file: File | null
  contractId: string | null
  standardTerms: string[]
  customTerms: string[]
  setStep: (step: UploadWizardStep) => void
  setContractType: (type: ContractType) => void
  setFile: (file: File | null) => void
  setUploadResult: (contractId: string, standardTerms: string[]) => void
  addCustomTerm: (term: string) => void
  removeCustomTerm: (term: string) => void
  reset: () => void
}

const initialState = {
  step: 'select-type' as UploadWizardStep,
  contractType: null,
  file: null,
  contractId: null,
  standardTerms: [],
  customTerms: [],
}

export const useUploadWizardStore = create<UploadWizardState>((set, get) => ({
  ...initialState,
  setStep: (step) => set({ step }),
  setContractType: (contractType) => set({ contractType }),
  setFile: (file) => set({ file }),
  setUploadResult: (contractId, standardTerms) =>
    set({ contractId, standardTerms, step: 'preview' }),
  addCustomTerm: (term) => {
    const trimmed = term.trim()
    if (!trimmed) return
    const { customTerms } = get()
    if (customTerms.length >= 5 || customTerms.includes(trimmed)) return
    set({ customTerms: [...customTerms, trimmed] })
  },
  removeCustomTerm: (term) =>
    set((state) => ({ customTerms: state.customTerms.filter((t) => t !== term) })),
  reset: () => set(initialState),
}))
