// Messages between the browser and the room server (a Durable Object). JSON over one WebSocket per player.

export type Role = 'hero' | 'master'
export type Placeable = 'enemy' | 'trap' | 'chest'
export type Cell = { cx: number; cy: number }

export type LobbyPlayer = { id: string; name: string; role: Role; color: number }

export type Phase = 'lobby' | 'playing' | 'heroes-won' | 'master-won'

export type HeroView = { id: string; x: number; y: number; hp: number; dead: boolean; respawnIn: number; attacking: boolean }
export type EnemyView = { id: number; x: number; y: number; hp: number }
export type ItemView = { id: number; kind: 'trap' | 'chest'; cx: number; cy: number }
export type PlanView = { cells: (Cell & { kind: Placeable })[] }

export type Snapshot = {
  room: number // 1-based
  lives: number
  points: number
  doorOpen: boolean
  heroes: HeroView[]
  enemies: EnemyView[]
  items: ItemView[]
  next?: PlanView // only sent to the master
}

export type ServerMessage =
  | { type: 'welcome'; you: string; code: string }
  | { type: 'lobby'; host: string; phase: Phase; players: LobbyPlayer[]; reason?: string }
  | { type: 'state'; s: Snapshot }
  | { type: 'error'; code: 'no-room' | 'taken' | 'full' | 'started' | 'bad-request' }

export type ClientMessage =
  | { type: 'role'; role: Role }
  | { type: 'start' }
  | { type: 'input'; dx: number; dy: number }
  | { type: 'place'; kind: Placeable; cx: number; cy: number }
  | { type: 'remove'; cx: number; cy: number }
  | { type: 'lobby' }

export const ROOM_CODE = /^[A-Z]{4}$/
export const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I/O, easy to read aloud
