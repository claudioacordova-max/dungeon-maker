// Pure game simulation, run by the room server. See protocol.ts for coordinates and the authority split:
// hero positions and what attacks hit come from each hero's device (checked here with tolerances); enemies, the
// map, doors, lives and everything the master builds are decided here.
import {
  angleDiff,
  buildableSlots,
  canAdd,
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
import type { EnemyKind, HeroAct, HeroClass, PlanItem, Placeable, RoomKind, Snapshot } from './protocol.ts'
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
  act: HeroAct | null
  shots: Map<number, { charged: boolean; at: number; used: boolean }>
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
  pending: 'throw' | 'fan' | 'jump' | null
  jumpFrom: { x: number; y: number }
  jumpTo: { x: number; y: number }
  touched: Map<string, number> // hero id -> game time of the last contact hit
}

type Room = MapRoom & { kind: RoomKind; entered: boolean; plan: PlanItem[] }
type Strike = { id: number; x: number; y: number; r: number; landsAt: number; claimed: Set<string> }
type Orb = { id: number; room: number; x: number; y: number; vx: number; vy: number; left: number; hitBy: Set<string> }
type Shot = { id: number; owner: string; x: number; y: number; dir: number; speed: number; left: number; crit: boolean }
type Item = { id: number; room: number; kind: 'trap' | 'chest'; x: number; y: number }
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
}

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
    lives: R.TEAM_LIVES,
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
  }
  const start: Room = { id: game.nextId++, gx: 0, gy: 0, kind: 'start', ready: true, entered: true, enemies: 0, plan: [] }
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
    act: null,
    shots: new Map(),
  }))
  return game
}

function spawnEnemy(game: Game, room: Room, kind: EnemyKind, x: number, y: number) {
  const hp = kind === 'king' ? R.ENEMY.king.hp : R.ENEMY[kind].hp
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
  })
}

// (Re)creates a room's enemies and items from its plan.
function spawnRoom(game: Game, room: Room) {
  game.enemies = game.enemies.filter((e) => e.room !== room.id)
  game.items = game.items.filter((i) => i.room !== room.id)
  const o = roomOrigin(room)
  for (const p of room.plan) {
    const x = o.x + p.cx + 0.5
    const y = o.y + p.cy + 0.5
    if (p.kind === 'slime' || p.kind === 'thrower') spawnEnemy(game, room, p.kind, x, y)
    else game.items.push({ id: game.nextId++, room: room.id, kind: p.kind, x, y })
  }
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
  game.rooms.push({ id: game.nextId++, gx, gy, kind, ready: false, entered: false, enemies: 0, plan: [] })
  return true
}

// Removes a room still being built, if no other room depends on it (only leaves of the map).
export function demolish(game: Game, roomId: number): boolean {
  const room = game.rooms.find((r) => r.id === roomId)
  if (!room || room.kind === 'start' || room.ready || room.entered) return false
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
  return room && room.kind !== 'start' && !room.entered && game.result === 'playing' ? room : null
}

export function place(game: Game, roomId: number, kind: Placeable, cx: number, cy: number): boolean {
  const room = editable(game, roomId)
  if (!room || !(kind in R.DIFFICULTY) || !isPlaceableCell(cx, cy)) return false
  if (room.plan.some((p) => p.cx === cx && p.cy === cy)) return false
  if (room.kind === 'boss' && Math.abs(cx + 0.5 - R.ROOM_W / 2) < 2 && Math.abs(cy + 0.5 - (R.ROOM_H / 2 + 2)) < 2) return false
  if (!canAdd(room.plan, kind)) return false
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
  // Removing a chest may push the room over the cap: not allowed.
  if (next.reduce((s, p) => s + R.DIFFICULTY[p.kind], 0) > R.ROOM_DIFFICULTY_CAP) return false
  room.plan = next
  if (room.ready) spawnRoom(game, room)
  return true
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
  const room = roomAtPoint(game.rooms, nx, ny)
  if (room) (room as Room).entered = true
}

function enemyPositionAt(game: Game, enemyId: number, time: number) {
  let best: EnemyFrame | undefined
  for (const frame of game.history) {
    if (frame.time <= time) best = frame
    else break
  }
  return (best ?? game.history[0])?.pos.get(enemyId) ?? null
}

function hurtEnemy(game: Game, hero: Hero, enemy: Enemy, damage: number) {
  enemy.hp -= damage
  enemy.stun = R.ENEMY_HIT_STUN
  if (enemy.kind !== 'king') {
    const d = dist(enemy.x, enemy.y, hero.x, hero.y) || 1
    const room = game.rooms.find((r) => r.id === enemy.room)
    const pushed = { x: enemy.x + ((enemy.x - hero.x) / d) * R.ENEMY_KNOCKBACK, y: enemy.y + ((enemy.y - hero.y) / d) * R.ENEMY_KNOCKBACK }
    const c = room ? clampToRoom(room, pushed.x, pushed.y, R.ENEMY[enemy.kind].radius) : pushed
    enemy.x = c.x
    enemy.y = c.y
  }
}

// True when the enemy was within `reach` of the hero where the device saw it (or where it is now).
function plausible(game: Game, hero: Hero, enemy: Enemy, reach: number, viewDelay: number) {
  const delay = Math.max(0, Math.min(R.MAX_VIEW_DELAY, Number(viewDelay) || 0))
  const seen = enemyPositionAt(game, enemy.id, game.time - delay) ?? enemy
  const radius = enemy.kind === 'king' ? R.ENEMY.king.radius : R.ENEMY[enemy.kind].radius
  const limit = reach + radius + R.HIT_RANGE_TOLERANCE
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
  hero.readyAt = game.time + spec.cooldown
  hero.facing = dir
  hero.act = { kind, dir, seq }
  if (hero.cls === 'melee') {
    const ids = Array.isArray(hits) ? hits.slice(0, 12).map(Number) : []
    for (const id of new Set(ids)) {
      const enemy = game.enemies.find((e) => e.id === id && e.hp > 0)
      if (enemy && plausible(game, hero, enemy, spec.range, viewDelay)) hurtEnemy(game, hero, enemy, spec.damage)
    }
    finishEnemies(game)
    return seq
  }
  const s = spec as (typeof R.HERO)['ranged']['basic']
  hero.shots.set(seq, { charged: kind === 'charged', at: game.time, used: false })
  if (hero.shots.size > 8) hero.shots.delete(hero.shots.keys().next().value!)
  game.shots.push({ id: game.nextId++, owner: hero.id, x: hero.x, y: hero.y, dir, speed: s.speed, left: s.range, crit: kind === 'charged' })
  return seq
}

export function shotHit(game: Game, heroId: string, seq: number, target: number, viewDelay: number): boolean {
  const hero = heroOf(game, heroId)
  const shot = hero?.shots.get(seq)
  const enemy = game.enemies.find((e) => e.id === target && e.hp > 0)
  if (!hero || hero.cls !== 'ranged' || !shot || shot.used || !enemy || game.time - shot.at > 1.5) return false
  const spec = R.HERO.ranged[shot.charged ? 'charged' : 'basic']
  if (!plausible(game, hero, enemy, spec.range, viewDelay)) return false
  shot.used = true
  hurtEnemy(game, hero, enemy, spec.damage)
  // The shot stops for everyone at the enemy it hit.
  const flying = game.shots.filter((s) => s.owner === hero.id)
  if (flying.length) game.shots = game.shots.filter((s) => s !== flying[0])
  finishEnemies(game)
  return true
}

function damageHero(game: Game, hero: Hero) {
  if (hero.dead || hero.invulnerable > 0 || game.result !== 'playing') return false
  hero.hp -= 1
  hero.invulnerable = R.HIT_INVULNERABLE
  if (hero.hp <= 0) {
    hero.hp = 0
    hero.dead = true
    hero.respawnAt = game.time + R.RESPAWN_SECONDS
    game.lives -= 1
    if (game.lives <= 0) {
      game.lives = 0
      game.result = 'master-won'
    }
  }
  return true
}

export function reportStruck(game: Game, heroId: string, strikeId: number): boolean {
  const hero = heroOf(game, heroId)
  const strike = game.strikes.find((s) => s.id === strikeId)
  if (!hero || !strike || strike.claimed.has(heroId)) return false
  if (game.time < strike.landsAt - R.ENEMY_TELEGRAPH || game.time > strike.landsAt + R.STRIKE_CLAIM_WINDOW) return false
  if (dist(strike.x, strike.y, hero.x, hero.y) > strike.r + 2) return false
  strike.claimed.add(heroId)
  return damageHero(game, hero)
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

export function reportTouched(game: Game, heroId: string, enemyId: number): boolean {
  const hero = heroOf(game, heroId)
  const enemy = game.enemies.find((e) => e.id === enemyId && e.hp > 0)
  if (!hero || !enemy || enemy.kind === 'thrower') return false
  const reach = (enemy.kind === 'king' ? R.ENEMY.king.radius : R.ENEMY.slime.radius) + R.HERO_RADIUS + 0.9
  if (dist(enemy.x, enemy.y, hero.x, hero.y) > reach) return false
  const cooldown = enemy.kind === 'king' ? R.ENEMY.king.touchCooldown : R.ENEMY.slime.touchCooldown
  if (game.time - (enemy.touched.get(heroId) ?? -99) < cooldown) return false
  enemy.touched.set(heroId, game.time)
  return damageHero(game, hero)
}

export function removeHero(game: Game, heroId: string) {
  game.heroes = game.heroes.filter((h) => h.id !== heroId)
}

// ---------- Simulation ----------

function finishEnemies(game: Game) {
  const killedBoss = game.enemies.some((e) => e.kind === 'king' && e.hp <= 0)
  game.enemies = game.enemies.filter((e) => e.hp > 0)
  countEnemies(game)
  if (killedBoss && game.result === 'playing') game.result = 'heroes-won'
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

function stepEnemy(game: Game, enemy: Enemy, heroes: Hero[], dt: number) {
  const room = game.rooms.find((r) => r.id === enemy.room)
  if (!room) return
  enemy.cooldown = Math.max(0, enemy.cooldown - dt)
  enemy.cooldown2 = Math.max(0, enemy.cooldown2 - dt)
  enemy.stun = Math.max(0, enemy.stun - dt)
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
    enemy.pending = null
    enemy.state = 'recover'
    enemy.stateTime = 0.45
    return
  }
  if (enemy.state === 'recover') {
    enemy.stateTime -= dt
    if (enemy.stateTime <= 0) enemy.state = 'idle'
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
      enemy.state = 'windup'
      enemy.stateTime = R.ENEMY_TELEGRAPH
      enemy.pending = 'throw'
      enemy.aim = toward
      enemy.cooldown = spec.cooldown
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
    const p = clampToRoom(room, enemy.x + Math.cos(toward) * move * spec.speed * dt, enemy.y + Math.sin(toward) * move * spec.speed * dt, spec.radius)
    enemy.x = p.x
    enemy.y = p.y
    return
  }

  if (enemy.kind === 'king') {
    const spec = R.ENEMY.king
    if (enemy.cooldown <= 0) {
      // Jump onto the target: a red zone where it will land.
      const to = clampToRoom(room, target.x, target.y, spec.radius)
      const id = game.nextId++
      game.strikes.push({ id, x: to.x, y: to.y, r: spec.jumpRadius, landsAt: game.time + R.ENEMY_TELEGRAPH, claimed: new Set() })
      enemy.state = 'jump'
      enemy.stateTime = R.ENEMY_TELEGRAPH
      enemy.pending = 'jump'
      enemy.jumpFrom = { x: enemy.x, y: enemy.y }
      enemy.jumpTo = to
      enemy.cooldown = spec.jumpEvery
      return
    }
    if (enemy.cooldown2 <= 0) {
      enemy.state = 'windup'
      enemy.stateTime = R.ENEMY_TELEGRAPH
      enemy.pending = 'fan'
      enemy.aim = toward
      enemy.cooldown2 = spec.fanEvery
      return
    }
  }

  const spec = enemy.kind === 'king' ? R.ENEMY.king : R.ENEMY.slime
  if (enemy.stun > 0 || best < spec.radius + R.HERO_RADIUS * 0.6) {
    enemy.state = 'idle'
    return
  }
  enemy.state = 'move'
  const p = clampToRoom(room, enemy.x + Math.cos(toward) * spec.speed * dt, enemy.y + Math.sin(toward) * spec.speed * dt, spec.radius)
  enemy.x = p.x
  enemy.y = p.y
}

export function step(game: Game, dt: number) {
  if (game.result !== 'playing') return
  game.time += dt

  const alive = game.heroes.filter((h) => !h.dead)
  for (const hero of game.heroes) {
    hero.invulnerable = Math.max(0, hero.invulnerable - dt)
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

  // Traps and chests, on the positions the devices reported.
  for (const hero of alive) {
    for (const item of game.items) {
      if (dist(item.x, item.y, hero.x, hero.y) > 0.6) continue
      if (item.kind === 'trap') damageHero(game, hero)
      else if (hero.hp < R.HERO_HITS) {
        hero.hp = Math.min(R.HERO_HITS, hero.hp + R.CHEST_HEAL)
        item.id = -1
      }
    }
  }
  game.items = game.items.filter((i) => i.id !== -1)
  finishEnemies(game)
}

export function snapshot(game: Game, forMaster: boolean): Snapshot {
  const r2 = (v: number) => Math.round(v * 100) / 100
  return {
    lives: game.lives,
    normalRooms: normalRooms(game),
    rooms: game.rooms.map((room) => ({
      id: room.id,
      gx: room.gx,
      gy: room.gy,
      kind: room.kind,
      ready: room.ready,
      entered: room.entered,
      enemies: room.enemies,
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
    })),
    strikes: game.strikes
      .filter((s) => s.landsAt >= game.time)
      .map((s) => ({ id: s.id, x: r2(s.x), y: r2(s.y), r: s.r, remaining: r2(s.landsAt - game.time) })),
    aims: game.enemies
      .filter((e) => e.state === 'windup' && (e.pending === 'throw' || e.pending === 'fan'))
      .map((e) => ({ enemy: e.id, dir: r2(e.aim), remaining: r2(e.stateTime) })),
    orbs: game.orbs.map((o) => ({ id: o.id, x: r2(o.x), y: r2(o.y) })),
    shots: game.shots.map((s) => ({ id: s.id, owner: s.owner, x: r2(s.x), y: r2(s.y), dir: r2(s.dir), crit: s.crit })),
    items: game.items.map((i) => ({ id: i.id, room: i.room, kind: i.kind, x: i.x, y: i.y })),
  }
}

export { angleDiff, roomAtGrid, ORB_RADIUS }
