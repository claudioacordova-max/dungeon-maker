// Messages between the browser and the room server (a Durable Object). JSON over one WebSocket per player.
//
// Netcode (see DESIGN.md, section Red): one shared match lives on the server. Each hero's device owns that hero's position
// and decides what it hit and whether an enemy strike reached it; the server validates with tolerances and owns
// everything shared: enemy health and deaths, team lives, rooms, doors and what the master places.

export type Role = 'hero' | 'master'
export type Placeable = 'enemy' | 'trap' | 'chest'
export type Cell = { cx: number; cy: number }

export type LobbyPlayer = { id: string; name: string; role: Role; color: number }

export type Phase = 'lobby' | 'playing' | 'heroes-won' | 'master-won'

// epoch changes when the server moves the hero itself (start, respawn, room change): the device must adopt x, y.
export type HeroView = {
  id: string
  x: number
  y: number
  epoch: number
  hp: number
  dead: boolean
  respawnIn: number
  attacking: boolean
}
export type EnemyView = { id: number; x: number; y: number; hp: number; stunned: boolean; windup: boolean }
// An announced enemy strike: a circle that lands `remaining` seconds after the snapshot was sent.
export type StrikeView = { id: number; x: number; y: number; r: number; remaining: number }
export type ItemView = { id: number; kind: 'trap' | 'chest'; cx: number; cy: number }
export type PlanView = { cells: (Cell & { kind: Placeable })[] }

export type Snapshot = {
  room: number // 1-based
  lives: number
  points: number
  doorOpen: boolean
  heroes: HeroView[]
  enemies: EnemyView[]
  strikes: StrikeView[]
  items: ItemView[]
  next?: PlanView // only sent to the master
}

export type ServerMessage =
  | { type: 'welcome'; you: string; code: string }
  | { type: 'lobby'; host: string; phase: Phase; players: LobbyPlayer[]; reason?: string }
  | { type: 'state'; s: Snapshot }
  | { type: 'error'; code: 'no-room' | 'taken' | 'full' | 'started' | 'bad-request' }
  | { type: 'pong'; t: number }

export type ClientMessage =
  | { type: 'role'; role: Role }
  | { type: 'start' }
  // Own hero position, as moved on the device.
  | { type: 'pos'; x: number; y: number; epoch: number }
  // Attack button. target: the enemy hit on the device (null = swing at nothing). viewDelay: seconds the device
  // shows enemies in the past (half the round trip + interpolation), so the server checks against what was seen.
  | { type: 'hit'; target: number | null; viewDelay: number }
  // The device saw an announced strike land on its hero.
  | { type: 'struck'; strike: number }
  | { type: 'ping'; t: number }
  | { type: 'place'; kind: Placeable; cx: number; cy: number }
  | { type: 'remove'; cx: number; cy: number }
  | { type: 'lobby' }

export const ROOM_CODE = /^[A-Z]{4}$/
export const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I/O, easy to read aloud
