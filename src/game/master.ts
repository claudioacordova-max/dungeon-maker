import { create } from 'zustand'
import { roomAtPoint } from '../shared/map'
import type { ClientMessage, Placeable, RoomView, Snapshot } from '../shared/protocol'

// Local UI state of the Maestro. `here` is the cell (room or free spot) where its body is (game/lord.ts): it decides
// the controls (build a room still in work, powers in a ready room, "Construir aquí" on a free spot). The map is a
// teleport. Building: `tool` is the enemy each tap on the floor places (null = none chosen yet); the enemy list opens
// beside its button (`picker`), and opens by itself when the floor is tapped with no enemy chosen: the enemy then goes
// on that tapped cell (`cell`). Powers: "Invocar" arms `summoning`, and the next tap on the floor places the slime.
type MasterState = {
  here: { gx: number; gy: number } | null
  mapOpen: boolean
  tool: Placeable | null
  picker: boolean
  shapes: boolean // floor shapes list open
  cell: { cx: number; cy: number } | null
  summoning: boolean
  buildView: boolean // the camera shows the whole room, after touching a building control; moving ends it
  setBuildView: (on: boolean) => void
  setHere: (here: { gx: number; gy: number }) => void
  setMapOpen: (open: boolean) => void
  setSummoning: (on: boolean) => void
  setTool: (tool: Placeable | null) => void
  setPicker: (open: boolean, cell?: { cx: number; cy: number } | null) => void
  setShapes: (open: boolean) => void
}

const closed = { picker: false, shapes: false, cell: null, summoning: false }

export const useMaster = create<MasterState>()((set) => ({
  here: null,
  mapOpen: false,
  tool: null,
  picker: false,
  shapes: false,
  cell: null,
  summoning: false,
  buildView: false,
  setBuildView: (buildView) => set({ buildView }),
  setHere: (here) => set({ here, ...closed }),
  setMapOpen: (mapOpen) => set({ mapOpen, ...closed }),
  setSummoning: (summoning) => set({ summoning }),
  setTool: (tool) => set({ tool }),
  setPicker: (picker, cell = null) => set({ picker, cell: picker ? cell : null, shapes: false, buildView: true }),
  setShapes: (shapes) => set({ shapes, picker: false, cell: null, buildView: true }),
}))

export const heroesInside = (s: Snapshot, room: RoomView) => s.heroes.some((h) => !h.dead && roomAtPoint(s.rooms, h.x, h.y)?.id === room.id)

// A room still being built (and not reached by the heroes) shows the building tools; any other, the powers.
export const isBuilding = (s: Snapshot, room: RoomView) => room.kind === 'normal' && !room.ready && !room.entered && !heroesInside(s, room)

// Places the chosen enemy (or removes the one there) on a cell of the room being built; with no enemy chosen, the
// enemy list opens and the enemy picked there goes on this cell.
export function tapCell(room: RoomView, cx: number, cy: number, send: (m: ClientMessage) => void) {
  const m = useMaster.getState()
  m.setBuildView(true)
  if ((room.plan ?? []).some((p) => p.cx === cx && p.cy === cy)) send({ type: 'remove', room: room.id, cx, cy })
  else if (m.tool) send({ type: 'place', room: room.id, kind: m.tool, cx, cy })
  else m.setPicker(true, { cx, cy })
}
