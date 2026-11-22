import { create } from 'zustand'
import { roomAtPoint } from '../shared/map'
import type { ClientMessage, Placeable, RoomView, Snapshot } from '../shared/protocol'

// Local UI state of the Maestro: the whole map, one room being built, or a ready room with its powers ('observe':
// tap an enemy to control it, "Invocar" then a tap on the floor to summon a slime there).
// Building: `tool` is the enemy each tap on the floor places (null = none chosen yet); the enemy list opens beside
// the enemy button (`picker`), and opens by itself when the floor is tapped with no enemy chosen: the enemy then
// goes on that tapped cell (`cell`).
type MasterState = {
  mode: 'map' | 'room' | 'observe'
  room: number | null
  tool: Placeable | null
  picker: boolean
  shapes: boolean // floor shapes list open
  cell: { cx: number; cy: number } | null
  summoning: boolean // "Invocar" pressed: the next tap on the floor places the slime
  setSummoning: (on: boolean) => void
  pending: { gx: number; gy: number } | null // just built: open it for editing when it appears
  editRoom: (room: number) => void
  observe: (room: number) => void
  toMap: () => void
  setTool: (tool: Placeable | null) => void
  setPicker: (open: boolean, cell?: { cx: number; cy: number } | null) => void
  setShapes: (open: boolean) => void
  setPending: (pending: { gx: number; gy: number } | null) => void
}

const closed = { picker: false, shapes: false, cell: null, summoning: false }

export const useMaster = create<MasterState>()((set) => ({
  mode: 'map',
  room: null,
  tool: null,
  picker: false,
  shapes: false,
  cell: null,
  summoning: false,
  setSummoning: (summoning) => set({ summoning }),
  pending: null,
  setPending: (pending) => set({ pending }),
  editRoom: (room) => set({ mode: 'room', room, pending: null, ...closed }),
  observe: (room) => set({ mode: 'observe', room, pending: null, ...closed }),
  toMap: () => set({ mode: 'map', room: null, ...closed }),
  setTool: (tool) => set({ tool }),
  setPicker: (picker, cell = null) => set({ picker, cell: picker ? cell : null, shapes: false }),
  setShapes: (shapes) => set({ shapes, picker: false, cell: null }),
}))

export const heroesInside = (s: Snapshot, room: RoomView) => s.heroes.some((h) => !h.dead && roomAtPoint(s.rooms, h.x, h.y)?.id === room.id)

// Tapping a room on the map: a room still being built opens for building; a ready one (or one the heroes reached)
// opens with the Maestro's powers.
export function openRoom(s: Snapshot, room: RoomView) {
  const m = useMaster.getState()
  if (room.kind === 'normal' && !room.ready && !room.entered && !heroesInside(s, room)) m.editRoom(room.id)
  else m.observe(room.id)
}

// Places the chosen enemy (or removes the one there) on a cell of the room being built; with no enemy chosen, the
// enemy list opens and the enemy picked there goes on this cell.
export function tapCell(room: RoomView, cx: number, cy: number, send: (m: ClientMessage) => void) {
  const m = useMaster.getState()
  if ((room.plan ?? []).some((p) => p.cx === cx && p.cy === cy)) send({ type: 'remove', room: room.id, cx, cy })
  else if (m.tool) send({ type: 'place', room: room.id, kind: m.tool, cx, cy })
  else m.setPicker(true, { cx, cy })
}
