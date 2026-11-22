// The enemy the Maestro controls, owned by the Maestro's device like a hero (see DESIGN.md, section Red): moved
// here at once with the movement stick and reported to the server (which limits the speed); the attack button
// (and the boss's second button) start the enemy's own attacks. Tap = auto-aim at the nearest hero, drag = aim.
import { useNet } from '../net/connection'
import { latestEnemy, sampleHero } from '../net/interp'
import { clampToRoom, roomOrigin } from '../shared/map'
import { touchesGap } from '../shared/layouts'
import type { EnemyView, Snapshot } from '../shared/protocol'
import { ENEMY, HERO_RADIUS, POLYMORPH, POSSESS } from '../shared/rules'
import { sfx } from '../audio/sfx'
import { attackInput, moveInput, specialInput } from './input'

export const ctl = {
  id: null as number | null,
  x: 0,
  y: 0,
  facing: -Math.PI / 2,
  moving: false,
  aim: null as number | null, // direction shown while a button is held
  aiming: false,
  button: 'attack' as 'attack' | 'special', // which button is held (the preview on the floor shows its attack)
}

type Button = 'attack' | 'special'

// Full wait of each button after it fires.
export function fullWait(kind: EnemyView['kind'], button: Button) {
  if (kind === 'king') return button === 'attack' ? ENEMY.king.jumpEvery : ENEMY.king.fanEvery
  if (kind === 'slime') return POSSESS.dashCooldown
  if (kind === 'ogre') return ENEMY.ogre.cooldown
  return ENEMY.thrower.cooldown
}

// Recharge of each button counted on this device (performance.now() ms when it is ready again, so it runs without
// the network delay), corrected by the server's value; `deniedAt` = a press too early. Read by the buttons each frame.
export const recharge = {
  attack: { until: 0, full: 1, firedAt: -1e9, deniedAt: -1e9 },
  special: { until: 0, full: 1, firedAt: -1e9, deniedAt: -1e9 },
}

let dashUntil = 0
let pendingDash: number | null = null // slime: a dash pressed just before it recharged, goes off when it does
let lastSnap: Snapshot | null = null
let sentAt = 0
let sent = { x: NaN, y: NaN }
let attackHeld = false
const rammedAt = new Map<string, number>() // hero id -> performance.now() of the last contact hit
let specialHeld = false

function nearestHero(s: Snapshot, x: number, y: number): number | null {
  let best: number = POSSESS.autoAim
  let dir: number | null = null
  for (const h of s.heroes) {
    if (h.dead) continue
    const p = sampleHero(h.id) ?? h
    const d = Math.hypot(p.x - x, p.y - y)
    if (d < best) {
      best = d
      dir = Math.atan2(p.y - y, p.x - x)
    }
  }
  return dir
}

export function resetPossess() {
  ctl.id = null
  ctl.aim = null
  ctl.aiming = false
  attackHeld = false
  specialHeld = false
  pendingDash = null
  for (const r of Object.values(recharge)) {
    r.until = 0
    r.firedAt = -1e9
  }
}

export function possessFrame(dt: number) {
  const net = useNet.getState()
  const s = net.snapshot
  const enemy = s && s.possessed !== null && !s.cinematic ? s.enemies.find((e) => e.id === s.possessed) : undefined
  if (!s || !enemy) {
    if (ctl.id !== null) resetPossess()
    return
  }
  const now = performance.now()
  if (ctl.id !== enemy.id) {
    const p = latestEnemy(enemy.id) ?? enemy
    resetPossess()
    ctl.id = enemy.id
    ctl.x = p.x
    ctl.y = p.y
    ctl.facing = enemy.facing
  }
  // The server's recharge, adopted when it drifts apart from the count here (not right after a press, while the
  // server has not heard of it yet).
  if (s !== lastSnap) {
    lastSnap = s
    const w = s.possessedWait
    for (const b of ['attack', 'special'] as const) {
      const r = recharge[b]
      r.full = fullWait(enemy.kind, b)
      if (!w || now - r.firedAt < net.latency + 250) continue
      const until = now + w[b] * 1000 - net.latency / 2
      if (Math.abs(until - r.until) > 250) r.until = w[b] > 0 ? until : 0
    }
  }
  const room = s.rooms.find((r) => r.id === enemy.room)
  const step = Math.min(dt, 0.1)
  // While the server plays one of its attacks (or it is stunned), follow the server.
  const locked = enemy.state === 'windup' || enemy.state === 'jump' || enemy.state === 'recover' || enemy.stunned
  if (locked || !room) {
    const p = latestEnemy(enemy.id)
    if (p) {
      ctl.x = p.x
      ctl.y = p.y
    }
    ctl.moving = false
  } else {
    const v = moveInput()
    const dashing = now < dashUntil
    const base = enemy.chicken ? POLYMORPH.fleeSpeed : ENEMY[enemy.kind].speed
    const speed = dashing ? base * POSSESS.dashSpeed : base
    const dx = dashing ? Math.cos(ctl.facing) : v.x
    const dy = dashing ? Math.sin(ctl.facing) : v.y
    ctl.moving = dx !== 0 || dy !== 0
    if (ctl.moving) {
      if (!dashing) ctl.facing = Math.atan2(dy, dx)
      const r = ENEMY[enemy.kind].radius
      const c = clampToRoom(room, ctl.x + dx * speed * step, ctl.y + dy * speed * step, r)
      const o = roomOrigin(room)
      const ok = (px: number, py: number) => !touchesGap(room.shape, px - o.x, py - o.y, r * 0.8)
      if (ok(c.x, c.y)) {
        ctl.x = c.x
        ctl.y = c.y
      } else if (ok(c.x, ctl.y)) ctl.x = c.x
      else if (ok(ctl.x, c.y)) ctl.y = c.y
    }
  }
  // (Written so that a first position, with nothing sent yet, also goes out.)
  const unchanged = Math.abs(ctl.x - sent.x) <= 0.01 && Math.abs(ctl.y - sent.y) <= 0.01
  if (now - sentAt > 66 && !unchanged) {
    net.send({ type: 'steer', x: ctl.x, y: ctl.y, facing: ctl.facing })
    sent = { x: ctl.x, y: ctl.y }
    sentAt = now
  }

  // Contact damage of the possessed slime (or boss), decided here with what this screen shows: the heroes see this
  // enemy late, so their own check would miss a ram. The server checks it is plausible.
  if ((enemy.kind === 'slime' || enemy.kind === 'king') && !enemy.chicken && enemy.state !== 'jump') {
    const reach = ENEMY[enemy.kind].radius + HERO_RADIUS
    const cooldown = (enemy.kind === 'king' ? ENEMY.king.touchCooldown : ENEMY.slime.touchCooldown) * 1000
    for (const h of s.heroes) {
      if (h.dead) continue
      const p = sampleHero(h.id) ?? h
      if (Math.hypot(p.x - ctl.x, p.y - ctl.y) > reach || now - (rammedAt.get(h.id) ?? -1e9) < cooldown) continue
      rammedAt.set(h.id, now)
      net.send({ type: 'ram', hero: h.id })
      sfx.hit()
    }
  }

  // Buttons: fire on release, toward the dragged direction or the nearest hero. A press while busy or a little
  // before it recharges (POSSESS.buffer) is kept and goes off as soon as it can (the server queues it); earlier
  // than that it is refused, with a shake of the button.
  const a = attackInput()
  const sp = specialInput()
  const dash = (d: number) => {
    dashUntil = now + POSSESS.dashSeconds * 1000
    recharge.attack.until = now + POSSESS.dashCooldown * 1000
    recharge.attack.firedAt = now
    ctl.facing = d
    net.send({ type: 'enemyAct', kind: 'attack', dir: d })
  }
  if (pendingDash !== null && now >= recharge.attack.until && !locked) {
    dash(pendingDash)
    pendingDash = null
  }
  const fire = (kind: Button, aiming: boolean, dir: number) => {
    const d = aiming ? dir : (nearestHero(s, ctl.x, ctl.y) ?? ctl.facing)
    if (enemy.chicken) return
    const r = recharge[kind]
    const left = r.until - now
    if (left > POSSESS.buffer * 1000) {
      r.deniedAt = now
      sfx.noMana()
      return
    }
    if (kind === 'attack' && enemy.kind === 'slime') {
      // The dash runs here at once (its speed is predicted), so it waits here too.
      if (left > 0 || locked) pendingDash = d
      else dash(d)
      return
    }
    ctl.facing = d
    r.until = Math.max(now, r.until) + r.full * 1000
    r.firedAt = now
    net.send({ type: 'enemyAct', kind, dir: d })
  }
  if (a.held) {
    attackHeld = true
    ctl.aim = a.aiming ? a.dir : (nearestHero(s, ctl.x, ctl.y) ?? ctl.facing)
    ctl.aiming = true
    ctl.button = 'attack'
  } else if (attackHeld) {
    attackHeld = false
    fire('attack', a.aiming, a.dir)
    ctl.aim = null
    ctl.aiming = false
  } else if (sp.held && enemy.kind === 'king') {
    specialHeld = true
    ctl.aim = sp.aiming ? sp.dir : (nearestHero(s, ctl.x, ctl.y) ?? ctl.facing)
    ctl.aiming = true
    ctl.button = 'special'
  } else if (specialHeld) {
    specialHeld = false
    fire('special', sp.aiming, sp.dir)
    ctl.aim = null
    ctl.aiming = false
  }
}
