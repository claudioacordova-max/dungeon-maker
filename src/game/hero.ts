// The own hero, owned by this device (see DESIGN.md, section Red): moved here at once, reported to the server, which only
// overrides it when it moves the hero itself (start, respawn, room change: a new epoch). Attacks and announced
// enemy strikes are also resolved here, against what this screen shows, and reported to the server.
import { useNet } from '../net/connection'
import { INTERP_DELAY, sampleEnemy } from '../net/interp'
import type { Snapshot, StrikeView } from '../shared/protocol'
import { ATTACK_COOLDOWN, ATTACK_RANGE } from '../shared/rules'
import { moveHero, strikeReaches } from '../shared/sim'
import { moveInput } from './input'

export const local = { x: 0, y: 0, epoch: -1, ready: false }

// Local feedback timers (performance.now() ms), read by the scene.
export const feedback = {
  swingUntil: 0,
  hurtUntil: 0,
  enemyFlash: new Map<number, number>(), // enemy id -> until
}

type PendingStrike = StrikeView & { landsAt: number; done: boolean }
const strikes = new Map<number, PendingStrike>()

let lastSent = { x: NaN, y: NaN, at: 0 }
let attackReadyAt = 0

function myView(s: Snapshot | null, you: string) {
  return s?.heroes.find((h) => h.id === you) ?? null
}

// Called on every snapshot: adopt server moves and schedule announced strikes on this device's clock.
export function onSnapshot(s: Snapshot, you: string) {
  const me = myView(s, you)
  if (me && me.epoch !== local.epoch) {
    local.x = me.x
    local.y = me.y
    local.epoch = me.epoch
    local.ready = true
  }
  const now = performance.now()
  for (const strike of s.strikes) {
    if (!strikes.has(strike.id)) strikes.set(strike.id, { ...strike, landsAt: now + strike.remaining * 1000, done: false })
  }
  for (const [id, strike] of strikes) if (now - strike.landsAt > 3000) strikes.delete(id)
}

export function resetHero() {
  local.ready = false
  local.epoch = -1
  strikes.clear()
  feedback.enemyFlash.clear()
}

// Strikes still showing on this screen, with their progress 0..1, for drawing the red zones.
export function visibleStrikes(): { id: number; x: number; y: number; r: number; progress: number }[] {
  const now = performance.now()
  const out = []
  for (const s of strikes.values()) {
    if (s.done || now > s.landsAt + 120) continue
    const total = Math.max(1, s.remaining * 1000)
    out.push({ id: s.id, x: s.x, y: s.y, r: s.r, progress: Math.min(1, 1 - (s.landsAt - now) / total) })
  }
  return out
}

// Per frame: move, report the position (~20 per second), and land due strikes on this hero.
export function frame(dt: number) {
  const net = useNet.getState()
  const me = myView(net.snapshot, net.you)
  if (!local.ready || !me || me.dead) return
  const v = moveInput()
  const moved = moveHero(local.x, local.y, v.x, v.y, Math.min(dt, 0.1))
  local.x = moved.x
  local.y = moved.y

  const now = performance.now()
  const changed = Math.abs(local.x - lastSent.x) > 0.01 || Math.abs(local.y - lastSent.y) > 0.01
  if ((changed && now - lastSent.at >= 50) || now - lastSent.at >= 500) {
    net.send({ type: 'pos', x: Math.round(local.x * 100) / 100, y: Math.round(local.y * 100) / 100, epoch: local.epoch })
    lastSent = { x: local.x, y: local.y, at: now }
  }

  for (const strike of strikes.values()) {
    if (strike.done || now < strike.landsAt) continue
    strike.done = true
    if (strikeReaches(strike, local.x, local.y)) {
      net.send({ type: 'struck', strike: strike.id })
      feedback.hurtUntil = now + 250
    }
  }
}

// Attack button: pick the nearest enemy in range as this screen shows it, react at once, let the server confirm.
export function attack() {
  const net = useNet.getState()
  const me = myView(net.snapshot, net.you)
  const now = performance.now()
  if (!net.snapshot || !me || me.dead || !local.ready || now < attackReadyAt) return
  attackReadyAt = now + ATTACK_COOLDOWN * 1000
  feedback.swingUntil = now + 150
  let target: number | null = null
  let best = ATTACK_RANGE
  for (const enemy of net.snapshot.enemies) {
    const p = sampleEnemy(enemy.id)
    if (!p) continue
    const d = Math.hypot(p.x - local.x, p.y - local.y)
    if (d <= best) {
      best = d
      target = enemy.id
    }
  }
  if (target !== null) feedback.enemyFlash.set(target, now + 180)
  net.send({ type: 'hit', target, viewDelay: (net.latency / 2 + INTERP_DELAY) / 1000 })
}
