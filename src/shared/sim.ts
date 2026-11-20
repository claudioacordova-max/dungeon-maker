// Pure game simulation, run by the room server. Coordinates in cells: x in [0, ROOM_W], y in [0, ROOM_H];
// the entrance is at the bottom (y = 0) and the door at the top centre (y = ROOM_H).
import type { Cell, Placeable, PlanView, Snapshot } from './protocol.ts'
import * as R from './rules.ts'

export type Hero = {
  id: string
  x: number
  y: number
  dx: number
  dy: number
  hp: number
  dead: boolean
  respawnAt: number
  attackCd: number
  attackFlash: number
  invulnerable: number
}
type Enemy = { id: number; x: number; y: number; hp: number; attackCd: number }
type Item = { id: number; kind: 'trap' | 'chest'; cx: number; cy: number }
type Planned = Cell & { kind: Placeable }

export type Game = {
  time: number
  room: number // 1-based
  lives: number
  points: number
  heroes: Hero[]
  enemies: Enemy[]
  items: Item[]
  next: Planned[]
  result: 'playing' | 'heroes-won' | 'master-won'
  nextId: number
}

const DOOR_X = R.ROOM_W / 2
const ENTRANCE_Y = 1

export function isPlaceable(cx: number, cy: number): boolean {
  return Number.isInteger(cx) && Number.isInteger(cy) && cx >= 0 && cx < R.ROOM_W && cy >= 2 && cy <= R.ROOM_H - 3
}

function entranceX(index: number, count: number): number {
  return DOOR_X + (index - (count - 1) / 2) * 1.1
}

export function createGame(heroIds: string[]): Game {
  const game: Game = {
    time: 0,
    room: 1,
    lives: R.TEAM_LIVES,
    points: R.MASTER_START_POINTS,
    heroes: heroIds.map((id, i) => ({
      id,
      x: entranceX(i, heroIds.length),
      y: ENTRANCE_Y,
      dx: 0,
      dy: 0,
      hp: R.HERO_HITS,
      dead: false,
      respawnAt: 0,
      attackCd: 0,
      attackFlash: 0,
      invulnerable: 0,
    })),
    enemies: [],
    items: [],
    next: [],
    result: 'playing',
    nextId: 1,
  }
  const firstRoom: Planned[] = [
    { kind: 'enemy' as const, cx: 2, cy: 8 },
    { kind: 'enemy' as const, cx: 6, cy: 9 },
  ].slice(0, R.FIRST_ROOM_ENEMIES)
  loadRoom(game, firstRoom)
  return game
}

function loadRoom(game: Game, plan: Planned[]) {
  game.enemies = []
  game.items = []
  for (const p of plan) {
    if (p.kind === 'enemy') {
      game.enemies.push({ id: game.nextId++, x: p.cx + 0.5, y: p.cy + 0.5, hp: R.ENEMY_HP, attackCd: R.ENEMY_ATTACK_COOLDOWN })
    } else {
      game.items.push({ id: game.nextId++, kind: p.kind, cx: p.cx, cy: p.cy })
    }
  }
}

export function setInput(game: Game, heroId: string, dx: number, dy: number) {
  const hero = game.heroes.find((h) => h.id === heroId)
  if (!hero || !Number.isFinite(dx) || !Number.isFinite(dy)) return
  const len = Math.hypot(dx, dy)
  const scale = len > 1 ? 1 / len : 1
  hero.dx = dx * scale
  hero.dy = dy * scale
}

export function removeHero(game: Game, heroId: string) {
  game.heroes = game.heroes.filter((h) => h.id !== heroId)
}

// Master edits only the next room. Returns false when the action is not allowed.
export function place(game: Game, kind: Placeable, cx: number, cy: number): boolean {
  if (game.result !== 'playing' || !isPlaceable(cx, cy)) return false
  if (game.next.some((p) => p.cx === cx && p.cy === cy)) return false
  const cost = R.COST[kind]
  if (cost === undefined || game.points < cost) return false
  game.points -= cost
  game.next.push({ kind, cx, cy })
  return true
}

export function remove(game: Game, cx: number, cy: number): boolean {
  const index = game.next.findIndex((p) => p.cx === cx && p.cy === cy)
  if (index < 0) return false
  game.points += R.COST[game.next[index].kind]
  game.next.splice(index, 1)
  return true
}

function damage(game: Game, hero: Hero) {
  if (hero.dead || hero.invulnerable > 0 || game.result !== 'playing') return
  hero.hp -= 1
  hero.invulnerable = R.HIT_INVULNERABLE
  game.points += R.POINTS_PER_HIT
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
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function step(game: Game, dt: number) {
  if (game.result !== 'playing') return
  game.time += dt
  const alive = game.heroes.filter((h) => !h.dead)

  for (const hero of game.heroes) {
    hero.attackFlash = Math.max(0, hero.attackFlash - dt)
    hero.invulnerable = Math.max(0, hero.invulnerable - dt)
    if (hero.dead) {
      if (game.time >= hero.respawnAt) {
        hero.dead = false
        hero.hp = R.HERO_HITS
        hero.x = DOOR_X
        hero.y = ENTRANCE_Y
        hero.invulnerable = R.HIT_INVULNERABLE
      }
      continue
    }
    hero.x = clamp(hero.x + hero.dx * R.HERO_SPEED * dt, R.HERO_RADIUS, R.ROOM_W - R.HERO_RADIUS)
    hero.y = clamp(hero.y + hero.dy * R.HERO_SPEED * dt, R.HERO_RADIUS, R.ROOM_H - R.HERO_RADIUS)

    hero.attackCd -= dt
    if (hero.attackCd <= 0) {
      let target: Enemy | undefined
      let best = R.ATTACK_RANGE
      for (const enemy of game.enemies) {
        const d = Math.hypot(enemy.x - hero.x, enemy.y - hero.y)
        if (d <= best) {
          best = d
          target = enemy
        }
      }
      if (target) {
        target.hp -= 1
        hero.attackCd = R.ATTACK_COOLDOWN
        hero.attackFlash = 0.15
      }
    }
  }
  game.enemies = game.enemies.filter((e) => e.hp > 0)

  for (const enemy of game.enemies) {
    enemy.attackCd = Math.max(0, enemy.attackCd - dt)
    let target: Hero | undefined
    let best = Infinity
    for (const hero of alive) {
      if (hero.dead) continue
      const d = Math.hypot(hero.x - enemy.x, hero.y - enemy.y)
      if (d < best) {
        best = d
        target = hero
      }
    }
    if (!target) continue
    if (best > R.ENEMY_REACH * 0.8) {
      enemy.x += ((target.x - enemy.x) / best) * R.ENEMY_SPEED * dt
      enemy.y += ((target.y - enemy.y) / best) * R.ENEMY_SPEED * dt
    }
    if (best <= R.ENEMY_REACH && enemy.attackCd <= 0) {
      damage(game, target)
      enemy.attackCd = R.ENEMY_ATTACK_COOLDOWN
    }
  }

  for (const hero of game.heroes) {
    if (hero.dead) continue
    for (const item of game.items) {
      if (Math.hypot(item.cx + 0.5 - hero.x, item.cy + 0.5 - hero.y) > 0.6) continue
      if (item.kind === 'trap') damage(game, hero)
      else {
        hero.hp = Math.min(R.HERO_HITS, hero.hp + R.CHEST_HEAL)
        item.id = -1 // consumed
      }
    }
  }
  game.items = game.items.filter((i) => i.id !== -1)

  if (game.result !== 'playing') return
  const doorOpen = game.enemies.length === 0
  const atDoor = game.heroes.some(
    (h) => !h.dead && h.y >= R.ROOM_H - R.HERO_RADIUS - 0.15 && Math.abs(h.x - DOOR_X) < 1,
  )
  if (doorOpen && atDoor) {
    if (game.room >= R.ROOMS_TO_WIN) {
      game.result = 'heroes-won'
      return
    }
    game.room += 1
    loadRoom(game, game.next)
    game.next = []
    game.heroes.forEach((hero, i) => {
      hero.x = entranceX(i, game.heroes.length)
      hero.y = ENTRANCE_Y
    })
  }
}

export function snapshot(game: Game, forMaster: boolean): Snapshot {
  const round = (v: number) => Math.round(v * 100) / 100
  const next: PlanView | undefined = forMaster ? { cells: game.next.map((p) => ({ ...p })) } : undefined
  return {
    room: game.room,
    lives: game.lives,
    points: game.points,
    doorOpen: game.enemies.length === 0,
    heroes: game.heroes.map((h) => ({
      id: h.id,
      x: round(h.x),
      y: round(h.y),
      hp: h.hp,
      dead: h.dead,
      respawnIn: h.dead ? Math.max(0, Math.ceil(h.respawnAt - game.time)) : 0,
      attacking: h.attackFlash > 0,
    })),
    enemies: game.enemies.map((e) => ({ id: e.id, x: round(e.x), y: round(e.y), hp: e.hp })),
    items: game.items.map((i) => ({ ...i })),
    next,
  }
}
