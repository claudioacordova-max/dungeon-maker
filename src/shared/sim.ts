// Pure game simulation, run by the room server. See protocol.ts for coordinates and the authority split:
// hero positions and what attacks hit come from each hero's device (checked here with tolerances); enemies, the
// map, doors, lives and everything the master builds are decided here.
import {
  angleDiff,
  buildableSlots,
  canAdd,
  difficulty,
  clampToRoom,
  isPlaceableCell,
  moveHero,
  roomAtGrid,
  roomAtPoint,
  roomCenter,
  roomOrigin,
  walkable,
  type MapRoom,
} from './map.ts'
import { CHEST_SLOTS, EMPTY_LAYOUT, floorCell, inGap, SHAPES, SPIKES, touchesGap, type Layout } from './layouts.ts'
import type { EnemyKind, HeroAct, HeroClass, PlanItem, Placeable, RoomKind, ShotKind, Snapshot, SpikePhase } from './protocol.ts'
import * as R from './rules.ts'

export { moveHero }

export type Hero = {
  id: string
  cls: HeroClass
  x: number
  y: number
  facing: number
  epoch: number
  lastPosTime: number
  hp: number
  dead: boolean
  respawnAt: number
  invulnerable: number
  readyAt: number // game time of the next allowed attack
  lastAttackAt: number
  act: HeroAct | null
  mana: number
  heals: number
  drinks: number
  shots: Map<number, { charged: boolean; at: number; used: boolean; healed: Set<string> }>
}

type EnemyState = 'idle' | 'move' | 'windup' | 'jump' | 'recover'
type Enemy = {
  id: number
  kind: EnemyKind
  room: number
  x: number
  y: number
  hp: number
  max: number
  facing: number
  state: EnemyState
  stateTime: number
  cooldown: number
  cooldown2: number // boss: fan of orbs
  stun: number
  aim: number // direction of the next throw
  pending: 'throw' | 'fan' | 'jump' | 'slam' | null
  jumpFrom: { x: number; y: number }
  jumpTo: { x: number; y: number }
  touched: Map<string, number> // hero id -> game time of the last contact hit
  burn: number // seconds of burning left
  burnTick: number // seconds to the next burn damage
  poly: number // seconds left as a chicken
  polyAt: number // game time it became a chicken
  polyShort: number // duration if it takes damage (seconds from polyAt); 0 once it took damage
  polyImmuneUntil: number // boss: game time before which it cannot be polymorphed again
  dashUntil: number // possessed slime: game time its dash ends
  steerAt: number // possessed: game time of the last position from the Maestro's device
  movedAt: number // possessed: game time it last moved (walk animation)
}

type Room = MapRoom & { kind: RoomKind; entered: boolean; plan: PlanItem[]; layout: Layout }
type Strike = { id: number; owner: number; x: number; y: number; r: number; hits: number; landsAt: number; claimed: Set<string> }
type Orb = { id: number; room: number; x: number; y: number; vx: number; vy: number; left: number; hitBy: Set<string> }
type Shot = { id: number; owner: string; seq: number; x: number; y: number; dir: number; speed: number; left: number; crit: boolean; kind: ShotKind }
type Item = { id: number; room: number; kind: 'trap' | 'chest'; x: number; y: number; openedAt: number | null; group: number }
type EnemyFrame = { time: number; pos: Map<number, { x: number; y: number }> }

export type Game = {
  time: number
  lives: number
  rooms: Room[]
  heroes: Hero[]
  enemies: Enemy[]
  strikes: Strike[]
  orbs: Orb[]
  recentOrbs: Orb[]
  shots: Shot[]
  items: Item[]
  history: EnemyFrame[]
  result: 'playing' | 'heroes-won' | 'master-won'
  nextId: number
  cap: number // difficulty cap of each room (grows with the number of heroes)
  maxLives: number
  maxChests: number
  bossHp: number
  potions: number // the team's shared potions
  rand: () => number // chance (tests replace it)
  intro: Set<string> // heroes still reading the intro: nothing moves until it is empty
  cinematic: { room: number; at: number } | null // boss entrance, from game time `at`
  possessed: number | null // enemy the Maestro controls
  summonAt: number // game time the Maestro can summon again
  summonWait: number // length of that wait
}

const usesMana = (cls: HeroClass): cls is 'priest' | 'mage' => cls === 'priest' || cls === 'mage'
const enemyRadius = (kind: EnemyKind) => R.ENEMY[kind].radius

const ORB_RADIUS = 0.25

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by)
}

function teleport(game: Game, hero: Hero, x: number, y: number) {
  hero.x = x
  hero.y = y
  hero.epoch += 1
  hero.lastPosTime = game.time
}

export function createGame(heroes: { id: string; cls: HeroClass }[]): Game {
  const game: Game = {
    time: 0,
    lives: R.teamLives(heroes.length),
    maxLives: R.teamLives(heroes.length),
    maxChests: R.maxChests(heroes.length),
    rooms: [],
    heroes: [],
    enemies: [],
    strikes: [],
    orbs: [],
    recentOrbs: [],
    shots: [],
    items: [],
    history: [],
    result: 'playing',
    nextId: 1,
    cap: R.roomCap(heroes.length),
    bossHp: R.bossHp(heroes.length),
    potions: 0,
    rand: Math.random,
    intro: new Set(heroes.map((h) => h.id)),
    cinematic: null,
    possessed: null,
    summonAt: 0,
    summonWait: 0,
  }
  const start: Room = { id: game.nextId++, gx: 0, gy: 0, kind: 'start', ready: true, entered: true, enemies: 0, plan: [], layout: EMPTY_LAYOUT }
  start.plan = [
    { kind: 'slime' as const, cx: 3, cy: 9 },
    { kind: 'slime' as const, cx: 7, cy: 10 },
  ].slice(0, R.START_ROOM_SLIMES)
  game.rooms.push(start)
  spawnRoom(game, start)
  const c = roomCenter(start)
  game.heroes = heroes.map((h, i) => ({
    id: h.id,
    cls: h.cls,
    x: c.x + (i - (heroes.length - 1) / 2) * 1.2,
    y: 2,
    facing: Math.PI / 2,
    epoch: 1,
    lastPosTime: 0,
    hp: R.HERO_HITS,
    dead: false,
    respawnAt: 0,
    invulnerable: 0,
    readyAt: 0,
    lastAttackAt: -99,
    act: null,
    mana: usesMana(h.cls) ? R.MANA[h.cls].max : 0,
    heals: 0,
    drinks: 0,
    shots: new Map(),
  }))
  return game
}

function spawnEnemy(game: Game, room: Room, kind: EnemyKind, x: number, y: number) {
  const hp = kind === 'king' ? game.bossHp : R.ENEMY[kind].hp
  game.enemies.push({
    id: game.nextId++,
    kind,
    room: room.id,
    x,
    y,
    hp,
    max: hp,
    facing: -Math.PI / 2,
    state: 'idle',
    stateTime: 0,
    cooldown: 1,
    cooldown2: R.ENEMY.king.fanEvery / 2,
    stun: 0,
    aim: 0,
    pending: null,
    jumpFrom: { x, y },
    jumpTo: { x, y },
    touched: new Map(),
    burn: 0,
    burnTick: 0,
    poly: 0,
    polyAt: 0,
    polyShort: 0,
    polyImmuneUntil: 0,
    dashUntil: 0,
    steerAt: 0,
    movedAt: -99,
  })
}

// (Re)creates a room's enemies and items from its plan.
function spawnRoom(game: Game, room: Room) {
  game.enemies = game.enemies.filter((e) => e.room !== room.id)
  game.items = game.items.filter((i) => i.room !== room.id)
  const o = roomOrigin(room)
  for (const p of room.plan) spawnEnemy(game, room, p.kind, o.x + p.cx + 0.5, o.y + p.cy + 0.5)
  const { shape, spikes, chests } = room.layout
  if (spikes) {
    SPIKES[shape].forEach(([cx, cy], i) =>
      game.items.push({ id: game.nextId++, room: room.id, kind: 'trap', x: o.x + cx + 0.5, y: o.y + cy + 0.5, openedAt: null, group: i % 2 }),
    )
  }
  for (const [cx, cy] of CHEST_SLOTS[shape].slice(0, chests)) {
    game.items.push({ id: game.nextId++, room: room.id, kind: 'chest', x: o.x + cx + 0.5, y: o.y + cy + 0.5, openedAt: null, group: 0 })
  }
  // The boss room is predesigned: only the boss, waiting for the heroes (and for the Maestro to possess it).
  if (room.kind === 'boss') {
    const c = roomCenter(room)
    spawnEnemy(game, room, 'king', c.x, c.y + 2)
  }
  countEnemies(game)
}

function countEnemies(game: Game) {
  for (const room of game.rooms) room.enemies = 0
  for (const e of game.enemies) {
    const room = game.rooms.find((r) => r.id === e.room)
    if (room) room.enemies += 1
  }
}

// ---------- Master ----------

function normalRooms(game: Game) {
  return game.rooms.filter((r) => r.kind === 'normal').length
}

export function build(game: Game, gx: number, gy: number, kind: 'normal' | 'boss'): boolean {
  if (game.result !== 'playing') return false
  if (!buildableSlots(game.rooms).some((s) => s.gx === gx && s.gy === gy)) return false
  if (game.rooms.some((r) => r.kind === 'boss')) return false // the boss room is always the last one
  if (kind === 'normal' && normalRooms(game) >= R.MAX_ROOMS) return false
  if (kind === 'boss' && normalRooms(game) < R.MAX_ROOMS) return false
  const room: Room = { id: game.nextId++, gx, gy, kind, ready: kind === 'boss', entered: false, enemies: 0, plan: [], layout: EMPTY_LAYOUT }
  game.rooms.push(room)
  if (kind === 'boss') spawnRoom(game, room) // predesigned and ready at once
  return true
}

// Removes a room still being built, if no other room depends on it (only leaves of the map).
export function demolish(game: Game, roomId: number): boolean {
  const room = game.rooms.find((r) => r.id === roomId)
  if (!room || room.kind === 'start' || (room.ready && room.kind !== 'boss') || room.entered) return false
  const others = game.rooms.filter((r) => r !== room)
  const reachable = new Set<Room>([others.find((r) => r.kind === 'start')!])
  let grew = true
  while (grew) {
    grew = false
    for (const r of others) {
      if (reachable.has(r)) continue
      if ([...reachable].some((q) => Math.abs(q.gx - r.gx) + Math.abs(q.gy - r.gy) === 1)) {
        reachable.add(r)
        grew = true
      }
    }
  }
  if (reachable.size !== others.length) return false
  game.rooms = others
  game.enemies = game.enemies.filter((e) => e.room !== roomId)
  game.items = game.items.filter((i) => i.room !== roomId)
  return true
}

function editable(game: Game, roomId: number): Room | null {
  const room = game.rooms.find((r) => r.id === roomId)
  return room && room.kind === 'normal' && !room.entered && game.result === 'playing' ? room : null
}

export function place(game: Game, roomId: number, kind: Placeable, cx: number, cy: number): boolean {
  const room = editable(game, roomId)
  if (!room || !(['slime', 'thrower', 'ogre'] as string[]).includes(kind) || !isPlaceableCell(cx, cy)) return false
  if (!floorCell(room.layout.shape, cx, cy)) return false
  if (room.plan.some((p) => p.cx === cx && p.cy === cy)) return false
  if (!canAdd(room.plan, room.layout, kind, game.cap)) return false
  room.plan.push({ kind, cx, cy })
  if (room.ready) spawnRoom(game, room)
  return true
}

export function removeItem(game: Game, roomId: number, cx: number, cy: number): boolean {
  const room = editable(game, roomId)
  if (!room) return false
  const index = room.plan.findIndex((p) => p.cx === cx && p.cy === cy)
  if (index < 0) return false
  const next = room.plan.filter((_, i) => i !== index)
  room.plan = next
  if (room.ready) spawnRoom(game, room)
  return true
}

// The "Sala" tab: floor shape, spike pack and number of chests. Enemies left over a missing stretch are removed;
// the total (enemies + layout) must stay within the cap.
export function setLayout(game: Game, roomId: number, shape: unknown, spikes: unknown, chests: unknown): boolean {
  const room = editable(game, roomId)
  if (!room || !SHAPES.includes(shape as Layout['shape']) || typeof spikes !== 'boolean') return false
  if (!Number.isInteger(chests) || (chests as number) < 0 || (chests as number) > game.maxChests) return false
  const layout: Layout = { shape: shape as Layout['shape'], spikes, chests: chests as number }
  const plan = room.plan.filter((p) => floorCell(layout.shape, p.cx, p.cy))
  if (difficulty(plan, layout) > game.cap) return false
  room.layout = layout
  room.plan = plan
  if (room.ready) spawnRoom(game, room)
  return true
}

export function spikePhase(time: number, group: number): SpikePhase {
  const c = R.SPIKE_CYCLE
  const period = c.down + c.warn + c.up
  const t = (((time + group * (period / 2)) % period) + period) % period
  return t < c.down ? 'down' : t < c.down + c.warn ? 'warn' : 'up'
}

function roomOf(game: Game, id: number) {
  return game.rooms.find((r) => r.id === id)
}

// Moves an enemy inside its room, never over a missing stretch of floor (sliding along the edge).
function moveEnemy(game: Game, enemy: Enemy, x: number, y: number) {
  const room = roomOf(game, enemy.room)
  if (!room) return
  const r = enemyRadius(enemy.kind)
  const o = roomOrigin(room)
  const ok = (px: number, py: number) => !touchesGap(room.layout.shape, px - o.x, py - o.y, r * 0.8)
  const c = clampToRoom(room, x, y, r)
  if (ok(c.x, c.y)) {
    enemy.x = c.x
    enemy.y = c.y
  } else if (ok(c.x, enemy.y)) enemy.x = c.x
  else if (ok(enemy.x, c.y)) enemy.y = c.y
}

export function setReady(game: Game, roomId: number, ready: boolean): boolean {
  const room = editable(game, roomId)
  if (!room || room.ready === ready) return false
  room.ready = ready
  if (ready) spawnRoom(game, room)
  else {
    game.enemies = game.enemies.filter((e) => e.room !== room.id)
    game.items = game.items.filter((i) => i.room !== room.id)
    countEnemies(game)
  }
  return true
}

// ---------- Hero reports ----------

function heroOf(game: Game, id: string) {
  const hero = game.heroes.find((h) => h.id === id)
  return hero && !hero.dead && game.result === 'playing' ? hero : null
}

export function reportPosition(game: Game, heroId: string, x: number, y: number, facing: number, epoch: number) {
  const hero = heroOf(game, heroId)
  if (!hero || epoch !== hero.epoch || !Number.isFinite(x) || !Number.isFinite(y)) return
  if (game.intro.size > 0 || game.cinematic) return // everyone stands still
  if (Number.isFinite(facing)) hero.facing = facing
  const elapsed = Math.max(game.time - hero.lastPosTime, 0.1)
  const allowed = R.HERO_SPEED * elapsed * R.MOVE_TOLERANCE + 0.25
  const d = dist(x, y, hero.x, hero.y)
  const k = d > allowed ? allowed / d : 1
  const nx = hero.x + (x - hero.x) * k
  const ny = hero.y + (y - hero.y) * k
  if (!walkable(game.rooms, nx, ny, R.HERO_RADIUS * 0.8)) return
  hero.x = nx
  hero.y = ny
  hero.lastPosTime = game.time
  const room = roomAtPoint(game.rooms, nx, ny) as Room | undefined
  if (room && !room.entered) {
    room.entered = true
    // The first hero inside the boss room starts the entrance: the Maestro appears and possesses the boss.
    if (room.kind === 'boss') {
      game.cinematic = { room: room.id, at: game.time }
      game.possessed = null
    }
  }
}

export function introReady(game: Game, heroId: string) {
  game.intro.delete(heroId)
}

function enemyPositionAt(game: Game, enemyId: number, time: number) {
  let best: EnemyFrame | undefined
  for (const frame of game.history) {
    if (frame.time <= time) best = frame
    else break
  }
  return (best ?? game.history[0])?.pos.get(enemyId) ?? null
}

// Damage on a chicken that was untouched cuts it back to the short duration.
function damageChicken(game: Game, enemy: Enemy) {
  if (enemy.poly <= 0 || enemy.polyShort <= 0) return
  enemy.poly = Math.max(0, enemy.polyShort - (game.time - enemy.polyAt))
  enemy.polyShort = 0
}

function hurtEnemy(game: Game, hero: Hero, enemy: Enemy, damage: number) {
  enemy.hp -= damage
  damageChicken(game, enemy)
  enemy.stun = R.ENEMY_HIT_STUN
  if (enemy.kind !== 'king' && enemy.kind !== 'ogre' && enemy.id !== game.possessed) {
    const d = dist(enemy.x, enemy.y, hero.x, hero.y) || 1
    moveEnemy(game, enemy, enemy.x + ((enemy.x - hero.x) / d) * R.ENEMY_KNOCKBACK, enemy.y + ((enemy.y - hero.y) / d) * R.ENEMY_KNOCKBACK)
  }
}

// True when the enemy was within `reach` of the hero where the device saw it (or where it is now).
function plausible(game: Game, hero: Hero, enemy: Enemy, reach: number, viewDelay: number) {
  const delay = Math.max(0, Math.min(R.MAX_VIEW_DELAY, Number(viewDelay) || 0))
  const seen = enemyPositionAt(game, enemy.id, game.time - delay) ?? enemy
  const limit = reach + enemyRadius(enemy.kind) + R.HIT_RANGE_TOLERANCE
  return dist(seen.x, seen.y, hero.x, hero.y) <= limit || dist(enemy.x, enemy.y, hero.x, hero.y) <= limit
}

// Attack started on the device. Melee hits are checked and applied now; ranged shots fly on the server too (so
// the others see them) and their hits come later as shotHit.
export function attack(
  game: Game,
  heroId: string,
  seq: number,
  kind: 'basic' | 'charged',
  dir: number,
  hits: unknown,
  viewDelay: number,
): number | null {
  const hero = heroOf(game, heroId)
  if (!hero || game.time < hero.readyAt - 0.08 || !Number.isFinite(dir)) return null
  if (!Number.isInteger(seq) || seq <= (hero.act?.seq ?? 0)) return null // the device numbers its attacks
  const spec = R.HERO[hero.cls][kind === 'charged' ? 'charged' : 'basic']
  if ('mana' in spec) {
    // Mana regenerates the same way on the device; a small margin absorbs timing differences.
    if (hero.mana < spec.mana - 0.25) return null
    hero.mana = Math.max(0, hero.mana - spec.mana)
  }
  hero.readyAt = game.time + spec.cooldown
  hero.lastAttackAt = game.time
  hero.facing = dir
  hero.act = { kind, dir, seq }
  if (hero.cls === 'melee') {
    const ids = Array.isArray(hits) ? hits.slice(0, 12).map(Number) : []
    for (const id of new Set(ids)) {
      const enemy = game.enemies.find((e) => e.id === id && e.hp > 0)
      if (enemy && plausible(game, hero, enemy, spec.range, viewDelay)) hurtEnemy(game, hero, enemy, R.HERO.melee[kind].damage)
    }
    finishEnemies(game)
    return seq
  }
  if (hero.cls === 'priest' && kind === 'charged') {
    // Prayer: heals every living ally close to her, herself included.
    const pray = R.HERO.priest.charged
    for (const ally of game.heroes) {
      if (!ally.dead && dist(ally.x, ally.y, hero.x, hero.y) <= pray.range + R.HIT_RANGE_TOLERANCE) heal(ally, pray.heal)
    }
    return seq
  }
  const s = spec as { speed: number; range: number }
  hero.shots.set(seq, { charged: kind === 'charged', at: game.time, used: false, healed: new Set() })
  if (hero.shots.size > 8) hero.shots.delete(hero.shots.keys().next().value!)
  game.shots.push({
    id: game.nextId++,
    owner: hero.id,
    seq,
    x: hero.x,
    y: hero.y,
    dir,
    speed: s.speed,
    left: s.range,
    crit: hero.cls === 'ranged' && kind === 'charged',
    kind: shotKind(hero.cls, kind),
  })
  return seq
}

function shotKind(cls: HeroClass, kind: 'basic' | 'charged'): ShotKind {
  if (cls === 'priest') return 'light'
  if (cls === 'mage') return kind === 'charged' ? 'poly' : 'spark'
  return 'arrow'
}

function heal(hero: Hero, amount: number) {
  if (hero.dead || hero.hp >= R.HERO_HITS) return false
  hero.hp = Math.min(R.HERO_HITS, hero.hp + amount)
  hero.heals += 1
  return true
}

// The mage's polymorph: a defenseless chicken for a few seconds; it drops whatever attack it was announcing.
function polymorph(game: Game, enemy: Enemy) {
  const short = enemy.kind === 'king' ? R.POLYMORPH.bossSeconds : R.POLYMORPH.seconds
  if (enemy.kind === 'king') {
    if (game.time < enemy.polyImmuneUntil) return
    enemy.polyImmuneUntil = game.time + short * R.POLYMORPH.untouchedBonus + R.POLYMORPH.bossImmune
  }
  enemy.poly = short * R.POLYMORPH.untouchedBonus
  enemy.polyAt = game.time
  enemy.polyShort = short
  if (enemy.state === 'jump') {
    // Lands where it was going, harmlessly.
    enemy.x = enemy.jumpTo.x
    enemy.y = enemy.jumpTo.y
  }
  game.strikes = game.strikes.filter((s) => s.owner !== enemy.id || s.landsAt <= game.time)
  enemy.state = 'idle'
  enemy.pending = null
  enemy.stateTime = 0
}

export function shotHit(game: Game, heroId: string, seq: number, target: number, viewDelay: number): boolean {
  const hero = heroOf(game, heroId)
  const shot = hero?.shots.get(seq)
  const enemy = game.enemies.find((e) => e.id === target && e.hp > 0)
  if (!hero || hero.cls === 'melee' || !shot || shot.used || !enemy || game.time - shot.at > 1.5) return false
  const kind = shot.charged ? 'charged' : 'basic'
  if (!plausible(game, hero, enemy, R.HERO[hero.cls][kind].range, viewDelay)) return false
  shot.used = true
  if (hero.cls === 'mage' && shot.charged) polymorph(game, enemy)
  else {
    const spec = R.HERO[hero.cls][kind] as { damage: number }
    hurtEnemy(game, hero, enemy, spec.damage)
    if (hero.cls === 'mage') {
      if (enemy.burn <= 0) enemy.burnTick = 1
      enemy.burn = R.BURN.seconds
    }
  }
  // The shot stops for everyone at the enemy it hit.
  game.shots = game.shots.filter((s) => !(s.owner === hero.id && s.seq === seq))
  finishEnemies(game)
  return true
}

// The priestess's light orb passed through an ally on her screen.
export function shotHeal(game: Game, heroId: string, seq: number, allyId: string): boolean {
  const hero = heroOf(game, heroId)
  const shot = hero?.shots.get(seq)
  const ally = game.heroes.find((h) => h.id === allyId)
  if (!hero || hero.cls !== 'priest' || !shot || shot.charged || !ally || ally === hero || shot.healed.has(allyId)) return false
  if (game.time - shot.at > 1.5) return false
  const spec = R.HERO.priest.basic
  if (dist(ally.x, ally.y, hero.x, hero.y) > spec.range + R.HIT_RANGE_TOLERANCE + 1) return false
  shot.healed.add(allyId)
  return heal(ally, spec.heal)
}

function damageHero(game: Game, hero: Hero, hits = 1) {
  if (hero.dead || hero.invulnerable > 0 || game.result !== 'playing') return false
  hero.hp -= hits
  hero.invulnerable = R.HIT_INVULNERABLE
  // A shared potion is drunk by itself when the hit leaves the hero about to fall (it saves even a fatal hit).
  if (hero.hp <= R.POTION.drinkAt && game.potions > 0) {
    game.potions -= 1
    hero.hp = Math.min(R.HERO_HITS, Math.max(0, hero.hp) + R.POTION.heal)
    hero.drinks += 1
  }
  if (hero.hp <= 0) downHero(game, hero)
  return true
}

// The hero falls (hit bar empty, or off the edge of the floor): the team loses a life; back after a moment.
function downHero(game: Game, hero: Hero) {
  hero.hp = 0
  hero.dead = true
  hero.respawnAt = game.time + R.RESPAWN_SECONDS
  game.lives -= 1
  if (game.lives <= 0) {
    game.lives = 0
    game.result = 'master-won'
  }
}

// How far past the edge a hero's center must be to fall (a little grace when brushing it).
export const FALL_MARGIN = 0.15

export function reportStruck(game: Game, heroId: string, strikeId: number): boolean {
  const hero = heroOf(game, heroId)
  const strike = game.strikes.find((s) => s.id === strikeId)
  if (!hero || !strike || strike.claimed.has(heroId)) return false
  if (game.time < strike.landsAt - R.ENEMY_TELEGRAPH || game.time > strike.landsAt + R.STRIKE_CLAIM_WINDOW) return false
  if (dist(strike.x, strike.y, hero.x, hero.y) > strike.r + 2) return false
  strike.claimed.add(heroId)
  return damageHero(game, hero, strike.hits)
}

export function reportOrb(game: Game, heroId: string, orbId: number): boolean {
  const hero = heroOf(game, heroId)
  const orb = game.orbs.find((o) => o.id === orbId) ?? game.recentOrbs.find((o) => o.id === orbId)
  if (!hero || !orb || orb.hitBy.has(heroId)) return false
  if (dist(orb.x, orb.y, hero.x, hero.y) > 3) return false
  orb.hitBy.add(heroId)
  game.orbs = game.orbs.filter((o) => o !== orb) // it bursts on the hero for everyone
  return damageHero(game, hero)
}

// A chest opens when a hero's attack reaches it (seen on that hero's device): potions for the team.
export function openChest(game: Game, heroId: string, itemId: number): boolean {
  const hero = heroOf(game, heroId)
  const chest = game.items.find((i) => i.id === itemId && i.kind === 'chest' && i.openedAt === null)
  if (!hero || !chest || game.time - hero.lastAttackAt > 1.5) return false
  const reach = (hero.cls === 'melee' ? R.HERO.melee.charged.range : R.HERO.ranged.charged.range) + R.HIT_RANGE_TOLERANCE + 0.5
  if (dist(chest.x, chest.y, hero.x, hero.y) > reach) return false
  chest.openedAt = game.time
  game.potions += game.rand() < R.POTION.doubleChance ? 2 : 1
  return true
}

export function reportTouched(game: Game, heroId: string, enemyId: number): boolean {
  const hero = heroOf(game, heroId)
  const enemy = game.enemies.find((e) => e.id === enemyId && e.hp > 0)
  if (!hero || !enemy || (enemy.kind !== 'slime' && enemy.kind !== 'king') || enemy.poly > 0) return false
  if (enemy.id === game.possessed) return false // the Maestro's device reports its contacts (reportRam)
  const reach = enemyRadius(enemy.kind) + R.HERO_RADIUS + 0.9
  if (dist(enemy.x, enemy.y, hero.x, hero.y) > reach) return false
  const cooldown = enemy.kind === 'king' ? R.ENEMY.king.touchCooldown : R.ENEMY.slime.touchCooldown
  if (game.time - (enemy.touched.get(heroId) ?? -99) < cooldown) return false
  enemy.touched.set(heroId, game.time)
  return damageHero(game, hero)
}

export function removeHero(game: Game, heroId: string) {
  game.heroes = game.heroes.filter((h) => h.id !== heroId)
  game.intro.delete(heroId)
}

// ---------- Simulation ----------

function finishEnemies(game: Game) {
  const killedBoss = game.enemies.some((e) => e.kind === 'king' && e.hp <= 0)
  game.enemies = game.enemies.filter((e) => e.hp > 0)
  if (killedBoss && game.result === 'playing') game.result = 'heroes-won'
  if (game.possessed !== null && !game.enemies.some((e) => e.id === game.possessed)) game.possessed = null
  countEnemies(game)
}

function throwOrb(game: Game, enemy: Enemy, dir: number) {
  const spec = R.ENEMY.thrower
  game.orbs.push({
    id: game.nextId++,
    room: enemy.room,
    x: enemy.x + Math.cos(dir) * 0.5,
    y: enemy.y + Math.sin(dir) * 0.5,
    vx: Math.cos(dir) * spec.orbSpeed,
    vy: Math.sin(dir) * spec.orbSpeed,
    left: spec.orbRange,
    hitBy: new Set(),
  })
}

// ---------- Enemy attacks (started by the AI or by the Maestro controlling the enemy) ----------

function windup(enemy: Enemy, pending: Enemy['pending'], dir: number) {
  enemy.state = 'windup'
  enemy.stateTime = R.ENEMY_TELEGRAPH
  enemy.pending = pending
  enemy.aim = dir
  enemy.facing = dir
}

function startThrow(enemy: Enemy, dir: number) {
  windup(enemy, 'throw', dir)
  enemy.cooldown = R.ENEMY.thrower.cooldown
}

function startFan(enemy: Enemy, dir: number) {
  windup(enemy, 'fan', dir)
  enemy.cooldown2 = R.ENEMY.king.fanEvery
}

// Club slam: a red zone in front of the ogre, announced like every enemy attack.
function startSlam(game: Game, enemy: Enemy, dir: number) {
  const spec = R.ENEMY.ogre
  game.strikes.push({
    id: game.nextId++,
    owner: enemy.id,
    x: enemy.x + Math.cos(dir) * spec.slamAhead,
    y: enemy.y + Math.sin(dir) * spec.slamAhead,
    r: spec.slamRadius,
    hits: spec.slamHits,
    landsAt: game.time + R.ENEMY_TELEGRAPH,
    claimed: new Set(),
  })
  windup(enemy, 'slam', dir)
  enemy.cooldown = spec.cooldown
}

// Boss jump onto (x, y): a red zone where it will land. False when that spot is over the abyss.
function startJump(game: Game, enemy: Enemy, room: Room, x: number, y: number): boolean {
  const spec = R.ENEMY.king
  const to = clampToRoom(room, x, y, spec.radius)
  const o = roomOrigin(room)
  if (touchesGap(room.layout.shape, to.x - o.x, to.y - o.y, spec.radius * 0.8)) return false
  game.strikes.push({ id: game.nextId++, owner: enemy.id, x: to.x, y: to.y, r: spec.jumpRadius, hits: 1, landsAt: game.time + R.ENEMY_TELEGRAPH, claimed: new Set() })
  enemy.state = 'jump'
  enemy.stateTime = R.ENEMY_TELEGRAPH
  enemy.pending = 'jump'
  enemy.jumpFrom = { x: enemy.x, y: enemy.y }
  enemy.jumpTo = to
  enemy.facing = Math.atan2(to.y - enemy.y, to.x - enemy.x)
  enemy.cooldown = spec.jumpEvery
  return true
}

// ---------- The Maestro in the match: possession and summoning ----------

function heroesIn(game: Game, room: Room) {
  return game.heroes.filter((h) => !h.dead && roomAtPoint(game.rooms, h.x, h.y) === room)
}

// While the heroes read the intro the Maestro can already take, move and summon enemies (to set them up), but not
// attack: nothing else moves yet.
const busy = (game: Game) => game.result !== 'playing' || game.cinematic !== null

// The Maestro takes any enemy (also in a room the heroes have not reached: to place it by hand and wait for them).
// The boss is taken only by its entrance, and is never dropped.
export function possess(game: Game, enemyId: number): boolean {
  const enemy = game.enemies.find((e) => e.id === enemyId && e.hp > 0)
  if (busy(game) || !enemy || enemy.kind === 'king') return false
  if (game.enemies.some((e) => e.id === game.possessed && e.kind === 'king')) return false
  if (!roomOf(game, enemy.room)) return false
  game.possessed = enemy.id
  enemy.steerAt = game.time
  return true
}

export function release(game: Game): boolean {
  const enemy = game.enemies.find((e) => e.id === game.possessed)
  if (!enemy || enemy.kind === 'king') return false
  game.possessed = null
  return true
}

function possessedEnemy(game: Game) {
  return game.result === 'playing' && !game.cinematic ? game.enemies.find((e) => e.id === game.possessed) : undefined
}

// Position of the possessed enemy from the Maestro's device, limited to its speed like a hero's.
export function steer(game: Game, x: number, y: number, facing: number) {
  const enemy = possessedEnemy(game)
  if (!enemy || !Number.isFinite(x) || !Number.isFinite(y)) return
  if (enemy.state === 'windup' || enemy.state === 'jump' || enemy.state === 'recover' || enemy.stun > 0) return
  if (Number.isFinite(facing)) enemy.facing = facing
  const base = enemy.poly > 0 ? R.POLYMORPH.fleeSpeed : R.ENEMY[enemy.kind].speed
  const speed = game.time < enemy.dashUntil + 0.2 ? base * R.POSSESS.dashSpeed : base
  const elapsed = Math.max(game.time - enemy.steerAt, 0.1)
  enemy.steerAt = game.time
  const allowed = speed * elapsed * R.MOVE_TOLERANCE + 0.25
  const d = dist(x, y, enemy.x, enemy.y)
  if (d < 0.01) return
  const k = d > allowed ? allowed / d : 1
  moveEnemy(game, enemy, enemy.x + (x - enemy.x) * k, enemy.y + (y - enemy.y) * k)
  enemy.movedAt = game.time
}

// The possessed slime (or boss) touched a hero on the Maestro's screen: the Maestro's device decides it, like a
// hero's device decides its own hits (the hero sees the possessed enemy late, so its own check would miss). The
// server checks it is plausible: close enough here, with room for the delays.
export const RAM_TOLERANCE = 1.4
export function reportRam(game: Game, heroId: string): boolean {
  const enemy = possessedEnemy(game)
  const hero = heroOf(game, heroId)
  if (!enemy || !hero || (enemy.kind !== 'slime' && enemy.kind !== 'king') || enemy.poly > 0) return false
  if (dist(enemy.x, enemy.y, hero.x, hero.y) > enemyRadius(enemy.kind) + R.HERO_RADIUS + RAM_TOLERANCE) return false
  const cooldown = enemy.kind === 'king' ? R.ENEMY.king.touchCooldown : R.ENEMY.slime.touchCooldown
  if (game.time - (enemy.touched.get(heroId) ?? -99) < cooldown) return false
  enemy.touched.set(heroId, game.time)
  return damageHero(game, hero)
}

// The Maestro's attack button (and the boss's second one) on the possessed enemy, toward `dir`.
export function enemyAct(game: Game, kind: 'attack' | 'special', dir: number): boolean {
  const enemy = possessedEnemy(game)
  if (!enemy || game.intro.size > 0 || !Number.isFinite(dir) || enemy.poly > 0 || enemy.stun > 0) return false
  if (enemy.state === 'windup' || enemy.state === 'jump' || enemy.state === 'recover') return false
  const room = roomOf(game, enemy.room)
  if (!room) return false
  if (kind === 'special') {
    if (enemy.kind !== 'king' || enemy.cooldown2 > 0) return false
    startFan(enemy, dir)
    return true
  }
  if (enemy.cooldown > 0) return false
  if (enemy.kind === 'slime') {
    enemy.dashUntil = game.time + R.POSSESS.dashSeconds
    enemy.cooldown = R.POSSESS.dashCooldown
    enemy.facing = dir
    return true
  }
  if (enemy.kind === 'thrower') startThrow(enemy, dir)
  else if (enemy.kind === 'ogre') startSlam(game, enemy, dir)
  else {
    // The boss jumps toward the aimed direction, shorter if that spot is over the abyss.
    for (const reach of [R.POSSESS.kingJump, 3, 1.5]) {
      if (startJump(game, enemy, room, enemy.x + Math.cos(dir) * reach, enemy.y + Math.sin(dir) * reach)) return true
    }
    return false
  }
  return true
}

// True when a slime summoned at (x, y) would be a fight: heroes and enemies in that room.
export function summonIsFight(game: Game, room: Room) {
  return heroesIn(game, room).length > 0 && game.enemies.some((e) => e.room === room.id)
}

// The Maestro summons one slime where it taps, in any ready room but the boss's: on solid floor, never right next to
// a hero. A longer wait follows when it was not summoned into a fight.
export function summon(game: Game, roomId: number, x: number, y: number): boolean {
  const room = roomOf(game, roomId)
  if (busy(game) || !room || room.kind === 'boss' || !room.ready || game.time < game.summonAt) return false
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  const r = R.ENEMY.slime.radius
  const c = clampToRoom(room, x, y, r + 0.3)
  const o = roomOrigin(room)
  if (dist(c.x, c.y, x, y) > 1 || touchesGap(room.layout.shape, c.x - o.x, c.y - o.y, r)) return false
  if (game.heroes.some((h) => !h.dead && dist(h.x, h.y, c.x, c.y) < R.SUMMON.minHeroDistance)) return false
  const fight = summonIsFight(game, room)
  spawnEnemy(game, room, 'slime', c.x, c.y)
  game.summonWait = fight ? R.SUMMON.fightCooldown : R.SUMMON.calmCooldown
  game.summonAt = game.time + game.summonWait
  countEnemies(game)
  return true
}

function stepEnemy(game: Game, enemy: Enemy, heroes: Hero[], dt: number) {
  const room = game.rooms.find((r) => r.id === enemy.room)
  if (!room) return
  enemy.cooldown = Math.max(0, enemy.cooldown - dt)
  enemy.cooldown2 = Math.max(0, enemy.cooldown2 - dt)
  enemy.stun = Math.max(0, enemy.stun - dt)
  if (enemy.burn > 0) {
    enemy.burn -= dt
    enemy.burnTick -= dt
    if (enemy.burnTick <= 0) {
      enemy.hp -= R.BURN.perSecond // no stun: burning never locks an enemy in place
      damageChicken(game, enemy)
      enemy.burnTick += 1
    }
    if (enemy.burn <= 0) enemy.burn = 0
  }
  let target: Hero | undefined
  let best = Infinity
  for (const hero of heroes) {
    if (roomAtPoint(game.rooms, hero.x, hero.y) !== room) continue
    const d = dist(hero.x, hero.y, enemy.x, enemy.y)
    if (d < best) {
      best = d
      target = hero
    }
  }

  // Controlled by the Maestro: its device moves it (steer) and starts its attacks (enemyAct); no AI here.
  const possessed = enemy.id === game.possessed
  const walking = () => (enemy.state = game.time - enemy.movedAt < 0.2 ? 'move' : 'idle')

  if (enemy.poly > 0) {
    // A chicken: no attacks, it just runs away from the nearest hero.
    enemy.poly = Math.max(0, enemy.poly - dt)
    if (possessed) {
      walking()
      return
    }
    if (!target || enemy.stun > 0) {
      enemy.state = 'idle'
      return
    }
    const away = Math.atan2(enemy.y - target.y, enemy.x - target.x)
    enemy.facing = away
    enemy.state = 'move'
    const flee = R.POLYMORPH.fleeSpeed * dt
    moveEnemy(game, enemy, enemy.x + Math.cos(away) * flee, enemy.y + Math.sin(away) * flee)
    return
  }

  if (enemy.state === 'windup' || enemy.state === 'jump') {
    enemy.stateTime -= dt
    if (enemy.state === 'jump') {
      const k = 1 - Math.max(0, enemy.stateTime) / R.ENEMY_TELEGRAPH
      enemy.x = enemy.jumpFrom.x + (enemy.jumpTo.x - enemy.jumpFrom.x) * k
      enemy.y = enemy.jumpFrom.y + (enemy.jumpTo.y - enemy.jumpFrom.y) * k
    }
    if (enemy.stateTime > 0) return
    if (enemy.pending === 'throw') throwOrb(game, enemy, enemy.aim)
    if (enemy.pending === 'fan') {
      const n = R.ENEMY.king.fanOrbs
      for (let i = 0; i < n; i++) throwOrb(game, enemy, enemy.aim + (i - (n - 1) / 2) * 0.32)
    }
    const slammed = enemy.pending === 'slam'
    enemy.pending = null
    enemy.state = 'recover'
    enemy.stateTime = slammed ? R.ENEMY.ogre.recover : 0.45
    return
  }
  if (enemy.state === 'recover') {
    enemy.stateTime -= dt
    if (enemy.stateTime <= 0) enemy.state = 'idle'
    return
  }
  if (possessed) {
    walking()
    return
  }
  if (!target) {
    enemy.state = 'idle'
    return
  }
  const toward = Math.atan2(target.y - enemy.y, target.x - enemy.x)
  enemy.facing = toward

  if (enemy.kind === 'thrower') {
    const spec = R.ENEMY.thrower
    if (enemy.cooldown <= 0) {
      startThrow(enemy, toward)
      return
    }
    let move = 0
    if (best < spec.keepMin) move = -1
    else if (best > spec.keepMax) move = 1
    if (move === 0 || enemy.stun > 0) {
      enemy.state = 'idle'
      return
    }
    enemy.state = 'move'
    moveEnemy(game, enemy, enemy.x + Math.cos(toward) * move * spec.speed * dt, enemy.y + Math.sin(toward) * move * spec.speed * dt)
    return
  }

  if (enemy.kind === 'ogre') {
    const spec = R.ENEMY.ogre
    if (enemy.cooldown <= 0 && best <= spec.reach) {
      startSlam(game, enemy, toward)
      return
    }
  }

  if (enemy.kind === 'king') {
    if (enemy.cooldown <= 0) {
      // Jump onto the target; never lands over the abyss (tries again a moment later).
      if (!startJump(game, enemy, room, target.x, target.y)) enemy.cooldown = 0.6
      return
    }
    if (enemy.cooldown2 <= 0) {
      startFan(enemy, toward)
      return
    }
  }

  const spec = R.ENEMY[enemy.kind]
  if (enemy.stun > 0 || best < spec.radius + R.HERO_RADIUS * 0.6) {
    enemy.state = 'idle'
    return
  }
  enemy.state = 'move'
  moveEnemy(game, enemy, enemy.x + Math.cos(toward) * spec.speed * dt, enemy.y + Math.sin(toward) * spec.speed * dt)
}

export function step(game: Game, dt: number) {
  if (game.result !== 'playing') return
  // While the heroes read the intro nothing moves (the Maestro can already build).
  if (game.intro.size > 0) return
  game.time += dt
  if (game.cinematic) {
    // Boss entrance: everyone waits; at its end the Maestro controls the boss until the fight is over.
    if (game.time - game.cinematic.at < R.CINEMATIC_SECONDS) return
    const boss = game.enemies.find((e) => e.kind === 'king' && e.room === game.cinematic!.room)
    game.cinematic = null
    game.possessed = boss ? boss.id : null
    if (boss) boss.steerAt = game.time
  }

  const alive = game.heroes.filter((h) => !h.dead)
  for (const hero of game.heroes) {
    hero.invulnerable = Math.max(0, hero.invulnerable - dt)
    if (usesMana(hero.cls)) hero.mana = Math.min(R.MANA[hero.cls].max, hero.mana + dt / R.MANA[hero.cls].regen)
    if (hero.dead && game.time >= hero.respawnAt) {
      hero.dead = false
      hero.hp = R.HERO_HITS
      hero.invulnerable = R.RESPAWN_INVULNERABLE
      const mate = game.heroes.find((h) => !h.dead && h !== hero)
      if (mate) teleport(game, hero, mate.x, mate.y)
      else {
        const start = game.rooms.find((r) => r.kind === 'start')!
        const c = roomCenter(start)
        teleport(game, hero, c.x, c.y - 4)
      }
    }
  }

  for (const enemy of game.enemies) stepEnemy(game, enemy, alive, dt)
  game.strikes = game.strikes.filter((s) => game.time <= s.landsAt + R.STRIKE_CLAIM_WINDOW)

  for (const orb of game.orbs) {
    orb.x += orb.vx * dt
    orb.y += orb.vy * dt
    orb.left -= Math.hypot(orb.vx, orb.vy) * dt
  }
  const gone = game.orbs.filter((o) => {
    const room = game.rooms.find((r) => r.id === o.room)
    const inside = room && roomAtPoint(game.rooms, o.x, o.y) === room
    return o.left <= 0 || !inside
  })
  if (gone.length) {
    game.orbs = game.orbs.filter((o) => !gone.includes(o))
    game.recentOrbs = [...game.recentOrbs, ...gone].slice(-20)
  }
  for (const shot of game.shots) {
    shot.x += Math.cos(shot.dir) * shot.speed * dt
    shot.y += Math.sin(shot.dir) * shot.speed * dt
    shot.left -= shot.speed * dt
  }
  game.shots = game.shots.filter((s) => s.left > 0 && roomAtPoint(game.rooms, s.x, s.y))

  game.history.push({ time: game.time, pos: new Map(game.enemies.map((e) => [e.id, { x: e.x, y: e.y }])) })
  while (game.history.length > 0 && game.history[0].time < game.time - R.MAX_VIEW_DELAY - 0.2) game.history.shift()

  // Falls and spikes, on the positions the devices reported. Chests open when a hero hits them (openChest).
  for (const hero of alive) {
    const room = roomAtPoint(game.rooms, hero.x, hero.y)
    if (room) {
      const o = roomOrigin(room)
      if (inGap(room.layout.shape, hero.x - o.x, hero.y - o.y, FALL_MARGIN)) {
        downHero(game, hero)
        continue
      }
    }
    for (const item of game.items) {
      if (item.kind !== 'trap' || dist(item.x, item.y, hero.x, hero.y) > 0.6) continue
      if (spikePhase(game.time, item.group) === 'up') damageHero(game, hero)
    }
  }
  // Opened chests stay a moment (open lid) and then vanish.
  game.items = game.items.filter((i) => i.openedAt === null || game.time - i.openedAt < 1.2)
  finishEnemies(game)
}

export function snapshot(game: Game, forMaster: boolean): Snapshot {
  const r2 = (v: number) => Math.round(v * 100) / 100
  return {
    lives: game.lives,
    maxLives: game.maxLives,
    maxChests: game.maxChests,
    cap: game.cap,
    normalRooms: normalRooms(game),
    rooms: game.rooms.map((room) => ({
      id: room.id,
      gx: room.gx,
      gy: room.gy,
      kind: room.kind,
      ready: room.ready,
      entered: room.entered,
      enemies: room.enemies,
      shape: room.layout.shape,
      spikes: room.layout.spikes,
      chests: room.layout.chests,
      plan: forMaster && room.kind !== 'start' ? room.plan.map((p) => ({ ...p })) : undefined,
    })),
    heroes: game.heroes.map((h) => ({
      id: h.id,
      cls: h.cls,
      x: r2(h.x),
      y: r2(h.y),
      facing: r2(h.facing),
      epoch: h.epoch,
      hp: h.hp,
      dead: h.dead,
      respawnIn: h.dead ? Math.max(0, Math.ceil(h.respawnAt - game.time)) : 0,
      act: h.act,
      mana: r2(h.mana),
      heals: h.heals,
      drinks: h.drinks,
    })),
    enemies: game.enemies.map((e) => ({
      id: e.id,
      kind: e.kind,
      room: e.room,
      x: r2(e.x),
      y: r2(e.y),
      hp: e.hp,
      max: e.max,
      facing: r2(e.facing),
      state: e.state,
      stunned: e.stun > 0,
      burning: e.burn > 0,
      chicken: e.poly > 0,
      possessed: e.id === game.possessed,
    })),
    strikes: game.strikes
      .filter((s) => s.landsAt >= game.time)
      .map((s) => ({ id: s.id, x: r2(s.x), y: r2(s.y), r: s.r, remaining: r2(s.landsAt - game.time) })),
    aims: game.enemies
      .filter((e) => e.state === 'windup' && (e.pending === 'throw' || e.pending === 'fan'))
      .map((e) => ({ enemy: e.id, dir: r2(e.aim), remaining: r2(e.stateTime) })),
    orbs: game.orbs.map((o) => ({ id: o.id, x: r2(o.x), y: r2(o.y) })),
    shots: game.shots.map((s) => ({ id: s.id, owner: s.owner, x: r2(s.x), y: r2(s.y), dir: r2(s.dir), crit: s.crit, kind: s.kind })),
    items: game.items.map((i) => ({
      id: i.id,
      room: i.room,
      kind: i.kind,
      x: i.x,
      y: i.y,
      opened: i.openedAt !== null,
      phase: i.kind === 'trap' ? spikePhase(game.time, i.group) : undefined,
    })),
    potions: game.potions,
    introWaiting: [...game.intro],
    cinematic: game.cinematic ? { room: game.cinematic.room, t: r2(game.time - game.cinematic.at), total: R.CINEMATIC_SECONDS } : null,
    possessed: game.possessed,
    summonIn: r2(Math.max(0, game.summonAt - game.time)),
    summonWait: game.summonWait,
  }
}

export { angleDiff, roomAtGrid, ORB_RADIUS }
