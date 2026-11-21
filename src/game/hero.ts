// The own hero, owned by this device (see DESIGN.md, section Red): moved here at once, reported to the server,
// which only overrides it when it moves the hero itself (start, respawn: a new epoch). Attacks, shots and enemy
// attacks are resolved here, against what this screen shows, and reported to the server.
import { sfx } from '../audio/sfx'
import { useNet } from '../net/connection'
import { INTERP_DELAY, sampleEnemy, sampleHero, sampleOrb } from '../net/interp'
import { angleDiff, moveHero, overGap } from '../shared/map'
import type { EnemyKind, HeroClass, ShotKind, Snapshot, StrikeView } from '../shared/protocol'
import { CHARGE_TIME, ENEMY, HERO, HERO_RADIUS, HIT_INVULNERABLE, MANA } from '../shared/rules'
import { attackInput, moveInput, specialInput } from './input'

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
  aimKind: 'basic' as 'basic' | 'charged', // which attack the aim indicator shows
  aiming: false, // a stick is held (the indicator shows, auto-aimed when not dragged)
  mana: 0, // priestess and mage, predicted here like the server does
  noManaAt: -1e9, // performance.now() of the last attack refused for lack of mana
  fallAt: -1, // performance.now() when this hero walked off the edge (until the server brings it back)
}

const FALL_MARGIN = 0.15 // same grace as the server (sim.ts)

export const manaMax = (cls: HeroClass) => (cls === 'priest' || cls === 'mage' ? MANA[cls].max : 0)
export function manaCost(cls: HeroClass, charged: boolean) {
  const spec = HERO[cls][charged ? 'charged' : 'basic']
  return 'mana' in spec ? spec.mana : 0
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
export type LocalShot = { seq: number; x: number; y: number; dir: number; speed: number; left: number; crit: boolean; kind: ShotKind; healed: Set<string> }
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
let specialHeld = false

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
    local.mana = me.mana
    local.fallAt = -1
    local.ready = true
  }
  // Mana is predicted here; adopt the server's value when they drift apart (e.g. a refused attack).
  if (me && Math.abs(me.mana - local.mana) > 0.75) local.mana = me.mana
  const now = performance.now()
  const live = new Set(s.strikes.map((st) => st.id))
  for (const strike of s.strikes) {
    if (!strikes.has(strike.id)) strikes.set(strike.id, { ...strike, landsAt: now + strike.remaining * 1000, done: false })
  }
  // A strike that vanished before landing was cancelled (its enemy became a chicken).
  for (const [id, strike] of strikes) if (!live.has(id) && !strike.done && strike.landsAt - now > 120) strikes.delete(id)
  for (const [id, strike] of strikes) if (now - strike.landsAt > 3000) strikes.delete(id)
  if (orbsHit.size > 64) orbsHit.clear()
}

export function resetHero() {
  local.ready = false
  local.epoch = -1
  local.charge = 0
  local.aim = null
  local.fallAt = -1
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

function enemyRadius(kind: EnemyKind) {
  return ENEMY[kind].radius
}

// Auto-aim reach: the nearest enemy within this many cells, whatever the attack's range (a melee hero turns to it
// and swings; a shot flies toward it).
const AUTO_AIM = 9
const usesSpecialStick = (cls: HeroClass) => cls === 'priest' || cls === 'mage'

// Nearest enemy (as shown here) within `range`, for auto-aim.
export function autoAim(range = AUTO_AIM): number | null {
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
  const cost = manaCost(local.cls, charged)
  if (local.mana < cost) {
    local.noManaAt = now
    sfx.noMana()
    return
  }
  local.mana -= cost
  readyAt = now + spec.cooldown * 1000
  const dir = manualDir ?? autoAim() ?? local.facing
  local.facing = dir
  seq += 1
  feedback.attackAt = now
  feedback.attackKind = charged ? 'charged' : 'basic'
  feedback.attackDir = dir
  const viewDelay = (net.latency / 2 + INTERP_DELAY) / 1000
  const hits: number[] = []
  if (local.cls === 'melee') (charged ? sfx.spin : sfx.swing)()
  else if (local.cls === 'ranged') (charged ? sfx.critShot : sfx.shot)()
  else if (local.cls === 'priest') (charged ? sfx.prayer : sfx.light)()
  else (charged ? sfx.polyCast : sfx.spark)()
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
    for (const item of net.snapshot.items) {
      if (item.kind !== 'chest' || item.opened) continue
      const dx = item.x - local.x
      const dy = item.y - local.y
      const d = Math.hypot(dx, dy) - 0.35
      const inside = charged
        ? d <= melee.charged.range
        : d <= melee.basic.range && (d < 0.3 || angleDiff(Math.atan2(dy, dx), dir) <= melee.basic.arc / 2)
      if (inside) net.send({ type: 'openChest', item: item.id })
    }
  } else if (!(local.cls === 'priest' && charged)) {
    const s = spec as { speed: number; range: number }
    const kind: ShotKind = local.cls === 'priest' ? 'light' : local.cls === 'mage' ? (charged ? 'poly' : 'spark') : 'arrow'
    shots.push({ seq, x: local.x, y: local.y, dir, speed: s.speed, left: s.range, crit: local.cls === 'ranged' && charged, kind, healed: new Set() })
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
  const max = manaMax(local.cls)
  if (max > 0 && !me.dead) local.mana = Math.min(max, local.mana + step / MANA[local.cls as 'priest' | 'mage'].regen)

  // Own shots (drawn by the scene) and their hits.
  for (let i = shots.length - 1; i >= 0; i--) {
    const shot = shots[i]
    const move = shot.speed * step
    shot.x += Math.cos(shot.dir) * move
    shot.y += Math.sin(shot.dir) * move
    shot.left -= move
    let hit = false
    // The priestess's orb heals every ally it passes through, then keeps flying.
    if (shot.kind === 'light') {
      for (const h of s.heroes) {
        if (h.id === net.you || h.dead || shot.healed.has(h.id)) continue
        const p = sampleHero(h.id)
        if (p && Math.hypot(p.x - shot.x, p.y - shot.y) <= HERO_RADIUS + 0.3) {
          shot.healed.add(h.id)
          net.send({ type: 'shotHeal', seq: shot.seq, ally: h.id })
          if (h.hp < 4) sfx.heal()
        }
      }
    }
    for (const e of s.enemies) {
      const p = sampleEnemy(e.id)
      if (p && Math.hypot(p.x - shot.x, p.y - shot.y) <= enemyRadius(e.kind) + 0.2) {
        net.send({ type: 'shotHit', seq: shot.seq, target: e.id, viewDelay: (net.latency / 2 + INTERP_DELAY) / 1000 })
        if (shot.kind === 'poly') sfx.poof()
        else (shot.crit ? sfx.critHit : sfx.hit)()
        feedback.enemyFlash.set(e.id, now + 180)
        hit = true
        break
      }
    }
    if (!hit) {
      for (const item of s.items) {
        if (item.kind !== 'chest' || item.opened || Math.hypot(item.x - shot.x, item.y - shot.y) > 0.5) continue
        net.send({ type: 'openChest', item: item.id })
        hit = true
        break
      }
    }
    if (hit || shot.left <= 0) shots.splice(i, 1)
  }

  if (me.dead) {
    local.charge = 0
    local.aim = null
    local.aiming = false
    holdStart = -1
    specialHeld = false
    return
  }

  // Off the edge: no control while falling; the server counts the fall from the reported position.
  if (local.fallAt >= 0) {
    local.moving = false
    local.charge = 0
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

  // Attack: tap = basic with auto-aim; drag = manual aim. Swordsman and archer: hold for CHARGE_TIME = powered
  // attack on release. Priestess and mage: the attack stick never charges; their special stick fires the powered
  // ability (tap = auto-aim, drag = aim, released on lift).
  const a = attackInput()
  const sp = specialInput()
  const casters = usesSpecialStick(local.cls)
  if (a.held) {
    if (holdStart < 0) holdStart = now
    if (!casters) {
      const before = local.charge
      local.charge = Math.min(1, (now - holdStart) / 1000 / CHARGE_TIME)
      if (before < 1 && local.charge >= 1) sfx.chargeFull()
    }
    local.aim = a.aiming ? a.dir : null
    local.aimKind = local.charge >= 1 ? 'charged' : 'basic'
    local.aiming = true
  } else if (holdStart >= 0) {
    fire(!casters && local.charge >= 1, a.aiming ? a.dir : null)
    holdStart = -1
    local.charge = 0
    local.aim = null
    local.aiming = false
  } else if (casters && sp.held) {
    specialHeld = true
    local.aim = sp.aiming ? sp.dir : null
    local.aimKind = 'charged'
    local.aiming = true
  } else if (specialHeld) {
    specialHeld = false
    fire(true, sp.aiming ? sp.dir : null)
    local.aim = null
    local.aiming = false
  }

  if (overGap(s.rooms, local.x, local.y, FALL_MARGIN)) {
    local.fallAt = now
    sfx.fall()
    net.send({ type: 'pos', x: Math.round(local.x * 100) / 100, y: Math.round(local.y * 100) / 100, facing: local.facing, epoch: local.epoch })
    return
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
    if ((e.kind !== 'slime' && e.kind !== 'king') || e.chicken) continue
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
