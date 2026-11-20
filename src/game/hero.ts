// The own hero, owned by this device (see DESIGN.md, section Red): moved here at once, reported to the server,
// which only overrides it when it moves the hero itself (start, respawn: a new epoch). Attacks, shots and enemy
// attacks are resolved here, against what this screen shows, and reported to the server.
import { sfx } from '../audio/sfx'
import { useNet } from '../net/connection'
import { INTERP_DELAY, sampleEnemy, sampleOrb } from '../net/interp'
import { angleDiff, moveHero } from '../shared/map'
import type { HeroClass, Snapshot, StrikeView } from '../shared/protocol'
import { CHARGE_TIME, ENEMY, HERO, HERO_RADIUS, HIT_INVULNERABLE } from '../shared/rules'
import { attackInput, moveInput } from './input'

export const local = {
  x: 0,
  y: 0,
  facing: Math.PI / 2,
  epoch: -1,
  ready: false,
  cls: 'melee' as HeroClass,
  moving: false,
  charge: 0, // 0..1 while holding attack
  aim: null as number | null, // direction shown while aiming
}

// Local feedback (performance.now() ms), read by the scene for animations and effects.
export const feedback = {
  attackAt: -1e9,
  attackKind: 'basic' as 'basic' | 'charged',
  attackDir: 0,
  hurtAt: -1e9,
  enemyFlash: new Map<number, number>(), // enemy id -> until
}

// Own shots fly on this device; hits are reported with the attack's seq.
export type LocalShot = { seq: number; x: number; y: number; dir: number; speed: number; left: number; crit: boolean }
export const shots: LocalShot[] = []

type PendingStrike = StrikeView & { landsAt: number; done: boolean }
const strikes = new Map<number, PendingStrike>()
const orbsHit = new Set<number>()
const touchedAt = new Map<number, number>()

let lastSent = { x: NaN, y: NaN, at: 0 }
let readyAt = 0
let seq = 0
let invulnerableUntil = 0
let holdStart = -1

function snapshotMe() {
  const net = useNet.getState()
  return { net, me: net.snapshot?.heroes.find((h) => h.id === net.you) ?? null }
}

export function onSnapshot(s: Snapshot, you: string) {
  const me = s.heroes.find((h) => h.id === you)
  if (me && me.epoch !== local.epoch) {
    local.x = me.x
    local.y = me.y
    local.facing = me.facing
    local.epoch = me.epoch
    local.cls = me.cls
    local.ready = true
  }
  const now = performance.now()
  for (const strike of s.strikes) {
    if (!strikes.has(strike.id)) strikes.set(strike.id, { ...strike, landsAt: now + strike.remaining * 1000, done: false })
  }
  for (const [id, strike] of strikes) if (now - strike.landsAt > 3000) strikes.delete(id)
  if (orbsHit.size > 64) orbsHit.clear()
}

export function resetHero() {
  local.ready = false
  local.epoch = -1
  local.charge = 0
  local.aim = null
  strikes.clear()
  shots.length = 0
  feedback.enemyFlash.clear()
  holdStart = -1
}

export function visibleStrikes(): { id: number; x: number; y: number; r: number; progress: number }[] {
  const now = performance.now()
  const list = []
  for (const s of strikes.values()) {
    if (s.done || now > s.landsAt + 120) continue
    const total = Math.max(1, s.remaining * 1000)
    list.push({ id: s.id, x: s.x, y: s.y, r: s.r, progress: Math.min(1, 1 - (s.landsAt - now) / total) })
  }
  return list
}

function hurt(now: number) {
  sfx.heroHurt()
  feedback.hurtAt = now
  invulnerableUntil = now + HIT_INVULNERABLE * 1000
}

function enemyRadius(kind: string) {
  return kind === 'king' ? ENEMY.king.radius : kind === 'thrower' ? ENEMY.thrower.radius : ENEMY.slime.radius
}

// Nearest enemy (as shown here) within `range`, for auto-aim.
function autoAim(range: number): number | null {
  const s = useNet.getState().snapshot
  if (!s) return null
  let best = range
  let dir: number | null = null
  for (const e of s.enemies) {
    const p = sampleEnemy(e.id)
    if (!p) continue
    const d = Math.hypot(p.x - local.x, p.y - local.y) - enemyRadius(e.kind)
    if (d < best) {
      best = d
      dir = Math.atan2(p.y - local.y, p.x - local.x)
    }
  }
  return dir
}

function fire(charged: boolean, manualDir: number | null) {
  const { net, me } = snapshotMe()
  const now = performance.now()
  if (!net.snapshot || !me || me.dead || !local.ready || now < readyAt) return
  const spec = HERO[local.cls][charged ? 'charged' : 'basic']
  readyAt = now + spec.cooldown * 1000
  const dir = manualDir ?? autoAim(spec.range * 1.4) ?? local.facing
  local.facing = dir
  seq += 1
  feedback.attackAt = now
  feedback.attackKind = charged ? 'charged' : 'basic'
  feedback.attackDir = dir
  const viewDelay = (net.latency / 2 + INTERP_DELAY) / 1000
  const hits: number[] = []
  if (local.cls === 'melee') (charged ? sfx.spin : sfx.swing)()
  else (charged ? sfx.critShot : sfx.shot)()
  if (local.cls === 'melee') {
    const melee = HERO.melee
    for (const e of net.snapshot.enemies) {
      const p = sampleEnemy(e.id)
      if (!p) continue
      const dx = p.x - local.x
      const dy = p.y - local.y
      const d = Math.hypot(dx, dy) - enemyRadius(e.kind)
      const inside = charged
        ? d <= melee.charged.range
        : d <= melee.basic.range && (d < 0.3 || angleDiff(Math.atan2(dy, dx), dir) <= melee.basic.arc / 2)
      if (inside) {
        if (hits.length === 0) (charged ? sfx.critHit : sfx.hit)()
        hits.push(e.id)
        feedback.enemyFlash.set(e.id, now + 180)
      }
    }
  } else {
    const s = HERO.ranged[charged ? 'charged' : 'basic']
    shots.push({ seq, x: local.x, y: local.y, dir, speed: s.speed, left: s.range, crit: charged })
  }
  net.send({ type: 'attack', seq, kind: charged ? 'charged' : 'basic', dir, hits, viewDelay })
}

// Per frame: movement, aiming/charging, own shots, and enemy attacks landing on this hero.
export function frame(dt: number) {
  const { net, me } = snapshotMe()
  const s = net.snapshot
  if (!local.ready || !me || !s) return
  const now = performance.now()
  const step = Math.min(dt, 0.1)

  // Own shots (drawn by the scene) and their hits.
  for (let i = shots.length - 1; i >= 0; i--) {
    const shot = shots[i]
    const move = shot.speed * step
    shot.x += Math.cos(shot.dir) * move
    shot.y += Math.sin(shot.dir) * move
    shot.left -= move
    let hit = false
    for (const e of s.enemies) {
      const p = sampleEnemy(e.id)
      if (p && Math.hypot(p.x - shot.x, p.y - shot.y) <= enemyRadius(e.kind) + 0.2) {
        net.send({ type: 'shotHit', seq: shot.seq, target: e.id, viewDelay: (net.latency / 2 + INTERP_DELAY) / 1000 })
        ;(shot.crit ? sfx.critHit : sfx.hit)()
        feedback.enemyFlash.set(e.id, now + 180)
        hit = true
        break
      }
    }
    if (hit || shot.left <= 0) shots.splice(i, 1)
  }

  if (me.dead) {
    local.charge = 0
    local.aim = null
    holdStart = -1
    return
  }

  // Movement on this device, inside the map's walls and open doors.
  const v = moveInput()
  local.moving = v.x !== 0 || v.y !== 0
  const moved = moveHero(s.rooms, local.x, local.y, v.x, v.y, step)
  local.x = moved.x
  local.y = moved.y
  if (local.moving && now - feedback.attackAt > 250) local.facing = Math.atan2(v.y, v.x)

  // Attack: tap = basic with auto-aim; drag = manual aim; hold for CHARGE_TIME = powered attack on release.
  const a = attackInput()
  if (a.held) {
    if (holdStart < 0) holdStart = now
    const before = local.charge
    local.charge = Math.min(1, (now - holdStart) / 1000 / CHARGE_TIME)
    if (before < 1 && local.charge >= 1) sfx.chargeFull()
    local.aim = a.aiming ? a.dir : null
  } else if (holdStart >= 0) {
    const charged = local.charge >= 1
    fire(charged, a.aiming ? a.dir : null)
    holdStart = -1
    local.charge = 0
    local.aim = null
  }

  // Position report, ~20 per second.
  const changed = Math.abs(local.x - lastSent.x) > 0.01 || Math.abs(local.y - lastSent.y) > 0.01
  if ((changed && now - lastSent.at >= 50) || now - lastSent.at >= 500) {
    net.send({
      type: 'pos',
      x: Math.round(local.x * 100) / 100,
      y: Math.round(local.y * 100) / 100,
      facing: Math.round(local.facing * 100) / 100,
      epoch: local.epoch,
    })
    lastSent = { x: local.x, y: local.y, at: now }
  }

  // Announced strikes landing here.
  for (const strike of strikes.values()) {
    if (strike.done || now < strike.landsAt) continue
    strike.done = true
    if (Math.hypot(strike.x - local.x, strike.y - local.y) <= strike.r + HERO_RADIUS) {
      net.send({ type: 'struck', strike: strike.id })
      hurt(now)
    }
  }
  if (now < invulnerableUntil) return
  // Enemy orbs and slime contact, as shown on this screen.
  for (const orb of s.orbs) {
    if (orbsHit.has(orb.id)) continue
    const p = sampleOrb(orb.id)
    if (p && Math.hypot(p.x - local.x, p.y - local.y) <= 0.25 + HERO_RADIUS) {
      orbsHit.add(orb.id)
      net.send({ type: 'orbHit', orb: orb.id })
      hurt(now)
      return
    }
  }
  for (const e of s.enemies) {
    if (e.kind === 'thrower') continue
    const p = sampleEnemy(e.id)
    if (!p || Math.hypot(p.x - local.x, p.y - local.y) > enemyRadius(e.kind) + HERO_RADIUS) continue
    const cooldown = e.kind === 'king' ? ENEMY.king.touchCooldown : ENEMY.slime.touchCooldown
    if (now - (touchedAt.get(e.id) ?? -1e9) < cooldown * 1000) continue
    touchedAt.set(e.id, now)
    net.send({ type: 'touched', enemy: e.id })
    hurt(now)
    return
  }
}
