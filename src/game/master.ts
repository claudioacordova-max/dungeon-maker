import { create } from 'zustand'
import type { Placeable } from '../shared/protocol'

// Local UI state of the master: the whole map, or one room being edited; the tool used on tap; a chosen slot.
type MasterState = {
  mode: 'map' | 'room'
  room: number | null
  tool: Placeable | 'erase'
  slot: { gx: number; gy: number } | null
  editRoom: (room: number) => void
  toMap: () => void
  setTool: (tool: Placeable | 'erase') => void
  setSlot: (slot: { gx: number; gy: number } | null) => void
}

export const useMaster = create<MasterState>()((set) => ({
  mode: 'map',
  room: null,
  tool: 'slime',
  slot: null,
  editRoom: (room) => set({ mode: 'room', room, slot: null }),
  toMap: () => set({ mode: 'map', room: null }),
  setTool: (tool) => set({ tool }),
  setSlot: (slot) => set({ slot }),
}))
