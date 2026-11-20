import { create } from 'zustand'
import type { Placeable } from '../shared/protocol'

// Local UI state of the master: which room is shown and which tool places on tap.
type MasterState = {
  view: 'current' | 'next'
  tool: Placeable | 'erase'
  setView: (view: 'current' | 'next') => void
  setTool: (tool: Placeable | 'erase') => void
}

export const useMaster = create<MasterState>()((set) => ({
  view: 'next',
  tool: 'enemy',
  setView: (view) => set({ view }),
  setTool: (tool) => set({ tool }),
}))
