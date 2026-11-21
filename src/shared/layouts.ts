// Room layouts the master picks in the "Sala" tab: the floor shape (stretches of floor that are gone: walking off
// the edge is a fall), a spike pack placed for that shape, and up to 3 chests on slots that are always reachable.
// Shared by the server, the devices and the models. Coordinates are room-local cells: x in [0, ROOM_W] (11),
// y in [0, ROOM_H] (13), y up = north. Doors sit at the middle of each wall (x 4.5..6.5 on N/S, y 5.5..7.5 on E/W)
// and every shape keeps floor from every door to every other door.
import * as R from './rules.ts'

export type RoomShape = 'full' | 'banks' | 'cross' | 'bridge'
export const SHAPES: readonly RoomShape[] = ['full', 'banks', 'cross', 'bridge']
export const SHAPE_NAME: Record<RoomShape, string> = { full: 'Entera', banks: 'Orillas', cross: 'Cruz', bridge: 'Puente' }

// A missing stretch of floor: [x0, y0, x1, y1] in room-local cells.
export type Gap = readonly [number, number, number, number]

export const GAPS: Record<RoomShape, readonly Gap[]> = {
  full: [],
  // Both side strips gone; ledges at the middle still reach the east and west doors.
  banks: [
    [0, 0, 2.5, 5],
    [0, 8, 2.5, 13],
    [8.5, 0, 11, 5],
    [8.5, 8, 11, 13],
  ],
  // The four corners gone: a cross joining the four doors.
  cross: [
    [0, 0, 3.5, 3.5],
    [7.5, 0, 11, 3.5],
    [0, 9.5, 3.5, 13],
    [7.5, 9.5, 11, 13],
  ],
  // Two chasms across the middle: a central bridge, and ledges along the side walls (to the east and west doors).
  bridge: [
    [2, 3.5, 4, 9.5],
    [7, 3.5, 9, 9.5],
  ],
}

// Spike pack: 8 spikes per shape, on floor, in two groups that rise alternately (A = even index, B = odd index),
// so there is always a way through.
export const SPIKES: Record<RoomShape, readonly (readonly [number, number])[]> = {
  full: [[2, 3], [4, 3], [6, 3], [8, 3], [3, 9], [5, 9], [7, 9], [5, 6]],
  banks: [[3, 3], [5, 3], [7, 3], [4, 9], [6, 9], [1, 6], [9, 6], [5, 6]],
  cross: [[5, 2], [4, 4], [6, 4], [1, 6], [9, 6], [4, 8], [6, 8], [5, 10]],
  bridge: [[4, 5], [6, 7], [1, 4], [9, 8], [0, 8], [10, 4], [5, 2], [5, 10]],
}

// Chest slots, in order of use (1, 2 or 3 chests), on floor and away from spikes and edges.
export const CHEST_SLOTS: Record<RoomShape, readonly (readonly [number, number])[]> = {
  full: [[1, 6], [9, 6], [5, 11]],
  banks: [[3, 11], [7, 11], [7, 1]],
  cross: [[1, 8], [9, 4], [5, 11]],
  bridge: [[1, 11], [9, 11], [9, 1]],
}

export type Layout = { shape: RoomShape; spikes: boolean; chests: number }
export const EMPTY_LAYOUT: Layout = { shape: 'full', spikes: false, chests: 0 }

export function layoutCost(l: Layout): number {
  return (l.shape === 'full' ? 0 : R.DIFFICULTY.brokenFloor) + (l.spikes ? R.DIFFICULTY.spikes : 0) + l.chests * R.DIFFICULTY.chest
}

// True when the room-local point is over a missing stretch, at least `margin` inside it.
export function inGap(shape: RoomShape, lx: number, ly: number, margin = 0): boolean {
  return GAPS[shape].some(([x0, y0, x1, y1]) => lx > x0 + margin && lx < x1 - margin && ly > y0 + margin && ly < y1 - margin)
}

// True when a circle of radius r at the room-local point touches a missing stretch.
export function touchesGap(shape: RoomShape, lx: number, ly: number, r: number): boolean {
  return GAPS[shape].some(([x0, y0, x1, y1]) => {
    const dx = Math.max(x0 - lx, 0, lx - x1)
    const dy = Math.max(y0 - ly, 0, ly - y1)
    return dx * dx + dy * dy < r * r
  })
}

// A whole cell with floor under it (enemies and items can go there).
export function floorCell(shape: RoomShape, cx: number, cy: number): boolean {
  return !touchesGap(shape, cx + 0.5, cy + 0.5, 0.49)
}
