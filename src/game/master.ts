import { create } from 'zustand'
import type { Placeable } from '../shared/protocol'

// Local UI state of the master: the whole map, or one room being edited; the tool used on tap; a chosen slot.
type MasterState = {
  mode: 'map' | 'room'
  room: number | null
  tool: Placeable | 'erase'
  tab: 'room' | 'enemies' // room editor: layout ("Sala") or enemies ("Enemigos")
  setTab: (tab: 'room' | 'enemies') => void
  slot: { gx: number; gy: number } | null
  pending: { gx: number; gy: number } | null // just built: open it for editing when it appears
  editRoom: (room: number) => void
  toMap: () => void
  setTool: (tool: Placeable | 'erase') => void
  setSlot: (slot: { gx: number; gy: number } | null) => void
  setPending: (pending: { gx: number; gy: number } | null) => void
}

export const useMaster = create<MasterState>()((set) => ({
  mode: 'map',
  room: null,
  tool: 'slime',
  tab: 'room',
  setTab: (tab) => set({ tab }),
  slot: null,
  pending: null,
  setPending: (pending) => set({ pending }),
  editRoom: (room) => set({ mode: 'room', room, slot: null, pending: null, tab: 'room' }),
  toMap: () => set({ mode: 'map', room: null }),
  setTool: (tool) => set({ tool }),
  setSlot: (slot) => set({ slot }),
}))
