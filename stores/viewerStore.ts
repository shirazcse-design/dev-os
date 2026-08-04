import { create } from 'zustand'

interface ViewerState {
  targetPage: number
  zoom: number
  setTargetPage: (page: number) => void
  setZoom: (zoom: number) => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  targetPage: 1,
  zoom: 1,
  setTargetPage: (targetPage) => set({ targetPage }),
  setZoom: (zoom) => set({ zoom }),
}))
