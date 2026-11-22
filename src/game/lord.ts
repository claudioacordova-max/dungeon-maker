// The Maestro's own body (designer, 2026-11-22): moved with the same stick as a hero, only on the Maestro's device
// (nobody else sees it, so its position is never sent). It floats fast over the rooms and the free spots next to
// them, and passes through walls and doors, a little slower and half dissolved while inside one. The room where it
// is decides what the Maestro can do there (build, powers, or "Construir aquí"). It turns into smoke to possess an
// enemy and comes back beside it when it lets go; the map teleports it.
import { useNet } from '../net/connection'
import { latestEnemy } from '../net/interp'
import { buildableSlots } from '../shared/map'
import type { Snapshot } from '../shared/protocol'
import { LORD, ROOM_H, ROOM_W } from '../shared/rules'
import { moveInput } from './input'
import { useMaster } from './master'
import { ctl } from './possess'

export const lord = {
  ready: false,
  x: 0,
  y: 0,
  facing: -Math.PI / 2,
  moving: false,
  stillSince: 0, // performance.now() when it stopped moving
  phase: 0, // 0..1: dissolved while crossing a wall
  hidden: false, // inside a possessed enemy (or the boss entrance)
  // Smoke: a puff where it vanished or appeared, and the trail when it flies into an enemy.
  puffs: [] as { id: number; x: number; y: number; at: number }[],
  trail: null as { fx: number; fy: number; tx: number; ty: number; at: number } | null,
}

let wasPossessing: number | null = null
let wasInWall = false

const cellOf = (x: number, y: number) => ({ gx: Math.floor(x / ROOM_W), gy: Math.floor(y / ROOM_H) })

// Cells the Maestro can float over: every room, and the free spots where a room can be built.
function openCells(s: Snapshot) {
  const cells = new Set(s.rooms.map((r) => `${r.gx},${r.gy}`))
  if (!s.rooms.some((r) => r.kind === 'boss')) for (const sl of buildableSlots(s.rooms)) cells.add(`${sl.gx},${sl.gy}`)
  return cells
}

let puffId = 0
function puff(x: number, y: number) {
  lord.puffs.push({ id: ++puffId, x, y, at: performance.now() })
  if (lord.puffs.length > 6) lord.puffs.shift()
}

export function resetLord() {
  lord.ready = false
  lord.hidden = false
  lord.trail = null
  lord.puffs.length = 0
  wasPossessing = null
}

// The map's teleport: vanish here, appear in the middle of that room (or free spot).
export function teleportLord(gx: number, gy: number) {
  puff(lord.x, lord.y)
  lord.x = (gx + 0.5) * ROOM_W
  lord.y = (gy + 0.5) * ROOM_H
  lord.stillSince = performance.now() - 1000
  puff(lord.x, lord.y)
  updateHere()
}

function updateHere() {
  const { gx, gy } = cellOf(lord.x, lord.y)
  const here = useMaster.getState().here
  if (!here || here.gx !== gx || here.gy !== gy) useMaster.getState().setHere({ gx, gy })
}

export function lordFrame(dt: number) {
  if (import.meta.env.DEV) (window as unknown as { __dmLord?: typeof lord }).__dmLord = lord // visual tests only
  const s = useNet.getState().snapshot
  if (!s) return
  const now = performance.now()
  if (!lord.ready) {
    const start = s.rooms.find((r) => r.kind === 'start')
    lord.x = ((start?.gx ?? 0) + 0.5) * ROOM_W
    lord.y = ((start?.gy ?? 0) + 0.5) * ROOM_H - 1.5
    lord.ready = true
    lord.stillSince = now - 1000
    updateHere()
  }

  // Possession: it flies into the enemy as smoke, and comes back beside it (or where it died) when it lets go.
  const possessing = s.possessed
  if (possessing !== wasPossessing) {
    if (possessing !== null && !s.cinematic) {
      const e = s.enemies.find((x) => x.id === possessing)
      if (e) lord.trail = { fx: lord.x, fy: lord.y, tx: e.x, ty: e.y, at: now }
      puff(lord.x, lord.y)
    } else if (possessing === null && wasPossessing !== null) {
      const p = latestEnemy(wasPossessing) ?? { x: ctl.x, y: ctl.y }
      const open = openCells(s)
      const beside = [1.2, -1.2].map((dx) => ({ x: p.x + dx, y: p.y })).find((q) => open.has(`${cellOf(q.x, q.y).gx},${cellOf(q.x, q.y).gy}`))
      lord.x = (beside ?? p).x
      lord.y = (beside ?? p).y
      lord.stillSince = now - 1000
      puff(lord.x, lord.y)
    }
    wasPossessing = possessing
  }
  lord.hidden = possessing !== null || !!s.cinematic
  if (lord.hidden) {
    lord.moving = false
    updateHere()
    return
  }

  const v = moveInput()
  const step = Math.min(dt, 0.1)
  const open = openCells(s)
  const isOpen = (x: number, y: number) => {
    const c = cellOf(x, y)
    return open.has(`${c.gx},${c.gy}`)
  }
  // Inside a wall between two open cells (a doorway or a wall): slower and half dissolved.
  const lx = lord.x - Math.floor(lord.x / ROOM_W) * ROOM_W
  const ly = lord.y - Math.floor(lord.y / ROOM_H) * ROOM_H
  const b = LORD.wallBand
  const wallX = (lx < b && isOpen(lord.x - b, lord.y)) || (lx > ROOM_W - b && isOpen(lord.x + b, lord.y)) // a west/east wall
  const wallY = (ly < b && isOpen(lord.x, lord.y - b)) || (ly > ROOM_H - b && isOpen(lord.x, lord.y + b)) // a south/north wall
  const inWall = wallX || wallY
  const target = inWall ? 1 : 0
  lord.phase += (target - lord.phase) * Math.min(1, step * 14)
  if (inWall && !wasInWall) puff(lord.x, lord.y)
  wasInWall = inWall

  lord.moving = v.x !== 0 || v.y !== 0
  if (lord.moving) {
    // Walls are only crossed, never walked along: inside one, only the movement across it counts.
    let vx = v.x
    let vy = v.y
    if (wallX && (!wallY || Math.abs(v.x) >= Math.abs(v.y))) vy = 0
    else if (wallY) vx = 0
    const speed = LORD.speed * (inWall ? LORD.wallSpeed : 1)
    const nx = lord.x + vx * speed * step
    const ny = lord.y + vy * speed * step
    const margin = 0.6 // keeps it off the outer walls
    const fits = (x: number, y: number) => isOpen(x, y) && isOpen(x + Math.sign(v.x) * margin, y) && isOpen(x, y + Math.sign(v.y) * margin)
    if (fits(nx, ny)) {
      lord.x = nx
      lord.y = ny
    } else if (fits(nx, lord.y)) lord.x = nx
    else if (fits(lord.x, ny)) lord.y = ny
    lord.facing = Math.atan2(v.y, v.x)
    lord.stillSince = now
    // Moving leaves the wider building view.
    if (useMaster.getState().buildView) useMaster.getState().setBuildView(false)
  }
  updateHere()
}

// The room (or free spot) where the Maestro is.
export function hereRoom(s: Snapshot) {
  const here = useMaster.getState().here
  return here ? s.rooms.find((r) => r.gx === here.gx && r.gy === here.gy) : undefined
}
