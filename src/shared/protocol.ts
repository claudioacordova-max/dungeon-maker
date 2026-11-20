// Messages between the browser and the room server (a Durable Object). JSON over one WebSocket per player.
//
// Netcode (see DESIGN.md, section Red): one shared match lives on the server. Each hero's device owns that hero's
// position and decides what its attacks hit and whether enemy attacks reached it; the server validates with
// tolerances and owns everything shared: enemies, team lives, the map, doors and what the master builds.
//
// World coordinates are in cells: room (gx, gy) covers x in [gx*ROOM_W, (gx+1)*ROOM_W], y in [gy*ROOM_H, ...];
// +y is north (up the screen), drawn as -z in three.js.

export type Role = 'hero' | 'master'
export type HeroClass = 'melee' | 'ranged'
export type Placeable = 'slime' | 'thrower' | 'trap' | 'chest'
export type EnemyKind = 'slime' | 'thrower' | 'king'
export type RoomKind = 'start' | 'normal' | 'boss'
export type Dir = 'n' | 'e' | 's' | 'w'
export type DoorState = 'none' | 'closed' | 'open' | 'locked'

export type LobbyPlayer = { id: string; name: string; role: Role; cls: HeroClass; color: number }

export type Phase = 'lobby' | 'playing' | 'heroes-won' | 'master-won'

export type PlanItem = { kind: Placeable; cx: number; cy: number } // cell inside the room
export type RoomView = {
  id: number
  gx: number
  gy: number
  kind: RoomKind
  ready: boolean
  entered: boolean
  enemies: number // alive
  plan?: PlanItem[] // master only, while the room can still be edited
}

export type HeroAct = { kind: 'basic' | 'charged'; dir: number; seq: number }
export type HeroView = {
  id: string
  cls: HeroClass
  x: number
  y: number
  facing: number // radians in the xy plane, 0 = +x (east), PI/2 = +y (north)
  epoch: number // changes when the server moves the hero (start, respawn): the device must adopt x, y
  hp: number
  dead: boolean
  respawnIn: number
  act: HeroAct | null // last attack, for others to animate
}
export type EnemyView = {
  id: number
  kind: EnemyKind
  room: number
  x: number
  y: number
  hp: number
  max: number
  facing: number
  state: 'idle' | 'move' | 'windup' | 'jump' | 'recover'
  stunned: boolean
}
export type StrikeView = { id: number; x: number; y: number; r: number; remaining: number }
export type AimView = { enemy: number; dir: number; remaining: number } // thrower / boss aim before throwing
export type OrbView = { id: number; x: number; y: number }
export type ShotView = { id: number; owner: string; x: number; y: number; dir: number; crit: boolean }
export type ItemView = { id: number; room: number; kind: 'trap' | 'chest'; x: number; y: number }

export type Snapshot = {
  lives: number
  rooms: RoomView[]
  normalRooms: number
  heroes: HeroView[]
  enemies: EnemyView[]
  strikes: StrikeView[]
  aims: AimView[]
  orbs: OrbView[]
  shots: ShotView[]
  items: ItemView[]
}

export type ServerMessage =
  | { type: 'welcome'; you: string; code: string }
  | { type: 'lobby'; host: string; phase: Phase; players: LobbyPlayer[]; reason?: string }
  | { type: 'state'; s: Snapshot }
  | { type: 'error'; code: 'no-room' | 'taken' | 'full' | 'started' | 'bad-request' }
  | { type: 'pong'; t: number }

export type ClientMessage =
  | { type: 'role'; role: Role }
  | { type: 'class'; cls: HeroClass }
  | { type: 'start' }
  | { type: 'pos'; x: number; y: number; facing: number; epoch: number }
  // An attack started on the device. Melee: `hits` are the enemies the device saw inside the cone or circle.
  // Ranged: the shot flies on the device; its hit arrives later as 'shotHit'. viewDelay: seconds the device shows
  // enemies in the past (half the round trip + interpolation), so the server checks against what was seen.
  | { type: 'attack'; seq: number; kind: 'basic' | 'charged'; dir: number; hits: number[]; viewDelay: number }
  | { type: 'shotHit'; seq: number; target: number; viewDelay: number }
  // The device saw an enemy attack land on its hero.
  | { type: 'struck'; strike: number }
  | { type: 'orbHit'; orb: number }
  | { type: 'touched'; enemy: number }
  | { type: 'ping'; t: number }
  // Master
  | { type: 'build'; gx: number; gy: number; kind: 'normal' | 'boss' }
  | { type: 'demolish'; room: number }
  | { type: 'place'; room: number; kind: Placeable; cx: number; cy: number }
  | { type: 'remove'; room: number; cx: number; cy: number }
  | { type: 'ready'; room: number; ready: boolean }
  | { type: 'lobby' }

export const ROOM_CODE = /^[A-Z]{4}$/
export const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I/O, easy to read aloud
