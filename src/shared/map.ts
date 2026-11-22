// Map geometry shared by the server and the devices: rooms on a grid, doors, walls and movement.
import { inGap, layoutCost, type Layout, type RoomShape } from './layouts.ts'
import type { Dir, DoorState, PlanItem, Placeable } from './protocol.ts'
import * as R from './rules.ts'

export type MapRoom = { id: number; gx: number; gy: number; ready: boolean; enemies: number }

const STEP: Record<Dir, [number, number]> = { n: [0, 1], e: [1, 0], s: [0, -1], w: [-1, 0] }
export const DIRS: Dir[] = ['n', 'e', 's', 'w']

export function roomAtGrid(rooms: readonly MapRoom[], gx: number, gy: number): MapRoom | undefined {
  return rooms.find((r) => r.gx === gx && r.gy === gy)
}

export function roomAtPoint<T extends MapRoom>(rooms: readonly T[], x: number, y: number): T | undefined {
  const gx = Math.floor(x / R.ROOM_W)
  const gy = Math.floor(y / R.ROOM_H)
  return rooms.find((r) => r.gx === gx && r.gy === gy)
}

export function roomOrigin(room: { gx: number; gy: number }) {
  return { x: room.gx * R.ROOM_W, y: room.gy * R.ROOM_H }
}

export function roomCenter(room: { gx: number; gy: number }) {
  return { x: (room.gx + 0.5) * R.ROOM_W, y: (room.gy + 0.5) * R.ROOM_H }
}

export function neighbour(rooms: readonly MapRoom[], room: MapRoom, dir: Dir): MapRoom | undefined {
  const [dx, dy] = STEP[dir]
  return roomAtGrid(rooms, room.gx + dx, room.gy + dy)
}

// A door is open when both rooms are ready and at least one has no enemies left (so heroes can go in to fight
// and come back the way they came); 'locked' while either room is still being built.
export function doorState(rooms: readonly MapRoom[], room: MapRoom, dir: Dir): DoorState {
  const other = neighbour(rooms, room, dir)
  // The start room's south door always leads out to the forest clearing where the heroes start.
  if (!other) return isStart(room) && dir === 's' ? 'open' : 'none'
  if (!room.ready || !other.ready) return 'locked'
  return room.enemies === 0 || other.enemies === 0 ? 'open' : 'closed'
}

// Slots where the master may build: next to an existing room, to its north, east or west (never back south).
export function buildableSlots(rooms: readonly MapRoom[]): { gx: number; gy: number }[] {
  const out: { gx: number; gy: number }[] = []
  for (const room of rooms) {
    for (const dir of ['n', 'e', 'w'] as Dir[]) {
      const [dx, dy] = STEP[dir]
      const gx = room.gx + dx
      const gy = room.gy + dy
      if (!roomAtGrid(rooms, gx, gy) && !out.some((s) => s.gx === gx && s.gy === gy)) out.push({ gx, gy })
    }
  }
  return out
}

// Cells the master can use inside a room: not the outer ring (keeps doorways and walls clear).
export function isPlaceableCell(cx: number, cy: number): boolean {
  return Number.isInteger(cx) && Number.isInteger(cy) && cx >= 1 && cx <= R.ROOM_W - 2 && cy >= 1 && cy <= R.ROOM_H - 2
}

// Enemies plus the room's layout (broken floor, spikes, chests): all share the room's cap.
export function difficulty(plan: readonly PlanItem[], layout: Layout): number {
  return plan.reduce((sum, p) => sum + R.DIFFICULTY[p.kind], 0) + layoutCost(layout)
}

export function canAdd(plan: readonly PlanItem[], layout: Layout, kind: Placeable, cap: number): boolean {
  return difficulty(plan, layout) + R.DIFFICULTY[kind] <= cap
}

// The start room is always at grid (0, 0); the entrance clearing lies right south of it.
const isStart = (room: { gx: number; gy: number }) => room.gx === 0 && room.gy === 0

// The forest clearing outside the dungeon: as wide as a room, ENTRANCE_DEPTH cells deep, south of the start room;
// near the wall only the doorway is open.
export function inEntrance(x: number, y: number, r: number): boolean {
  if (y >= 0 || x < r || x > R.ROOM_W - r || y < -R.ENTRANCE_DEPTH + r) return false
  return y <= -r || Math.abs(x - R.ROOM_W / 2) <= R.DOOR_HALF - r
}

// True when a circle of radius r at (x, y) is on walkable floor: inside a room's floor, crossing a wall through an
// open doorway, or out in the entrance clearing.
export function walkable(rooms: readonly MapRoom[], x: number, y: number, r: number): boolean {
  if (y < 0) return inEntrance(x, y, r)
  const room = roomAtPoint(rooms, x, y)
  if (!room || !room.ready) return false
  const o = roomOrigin(room)
  const lx = x - o.x
  const ly = y - o.y
  const inX = lx >= r && lx <= R.ROOM_W - r
  const inY = ly >= r && ly <= R.ROOM_H - r
  if (inX && inY) return true
  const door = (dir: Dir) => doorState(rooms, room, dir) === 'open'
  const midX = Math.abs(lx - R.ROOM_W / 2) <= R.DOOR_HALF - r
  const midY = Math.abs(ly - R.ROOM_H / 2) <= R.DOOR_HALF - r
  if (inX || midX) {
    if (ly < r && midX && door('s') && inX) return true
    if (ly > R.ROOM_H - r && midX && door('n') && inX) return true
  }
  if (inY || midY) {
    if (lx < r && midY && door('w') && inY) return true
    if (lx > R.ROOM_W - r && midY && door('e') && inY) return true
  }
  return false
}

// Moves a hero by (dx, dy) * speed * dt, sliding along walls. Shared by the device (its own hero) and the server.
export function moveHero(rooms: readonly MapRoom[], x: number, y: number, dx: number, dy: number, dt: number) {
  const nx = x + dx * R.HERO_SPEED * dt
  const ny = y + dy * R.HERO_SPEED * dt
  if (walkable(rooms, nx, ny, R.HERO_RADIUS)) return { x: nx, y: ny }
  if (walkable(rooms, nx, y, R.HERO_RADIUS)) return { x: nx, y }
  if (walkable(rooms, x, ny, R.HERO_RADIUS)) return { x, y: ny }
  return { x, y }
}

// Keeps a point inside a room's floor (enemies never leave their room).
export function clampToRoom(room: { gx: number; gy: number }, x: number, y: number, r: number) {
  const o = roomOrigin(room)
  return {
    x: Math.max(o.x + r, Math.min(o.x + R.ROOM_W - r, x)),
    y: Math.max(o.y + r, Math.min(o.y + R.ROOM_H - r, y)),
  }
}

export function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}

// True when (x, y) is over a missing stretch of floor of its room, at least `margin` past the edge.
export function overGap(rooms: readonly (MapRoom & { shape?: RoomShape })[], x: number, y: number, margin: number): boolean {
  const room = roomAtPoint(rooms, x, y)
  if (!room?.shape) return false
  const o = roomOrigin(room)
  return inGap(room.shape, x - o.x, y - o.y, margin)
}
