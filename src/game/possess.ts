// The enemy the Maestro controls, owned by the Maestro's device like a hero (see DESIGN.md, section Red): moved
// here at once with the movement stick and reported to the server (which limits the speed); the attack button
// (and the boss's second button) start the enemy's own attacks. Tap = auto-aim at the nearest hero, drag = aim.
import { useNet } from '../net/connection'
import { latestEnemy, sampleHero } from '../net/interp'
import { clampToRoom, roomOrigin } from '../shared/map'
import { touchesGap } from '../shared/layouts'
import type { Snapshot } from '../shared/protocol'
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
}

let dashUntil = 0
let dashReadyAt = 0
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
  if (now - sentAt > 66 && (Math.abs(ctl.x - sent.x) > 0.01 || Math.abs(ctl.y - sent.y) > 0.01)) {
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

  // Buttons: fire on release, toward the dragged direction or the nearest hero.
  const a = attackInput()
  const sp = specialInput()
  const fire = (kind: 'attack' | 'special', aiming: boolean, dir: number) => {
    const d = aiming ? dir : (nearestHero(s, ctl.x, ctl.y) ?? ctl.facing)
    if (enemy.chicken || locked) return
    if (kind === 'attack' && enemy.kind === 'slime') {
      if (now < dashReadyAt) return
      dashUntil = now + POSSESS.dashSeconds * 1000
      dashReadyAt = now + POSSESS.dashCooldown * 1000
    }
    ctl.facing = d
    net.send({ type: 'enemyAct', kind, dir: d })
  }
  if (a.held) {
    attackHeld = true
    ctl.aim = a.aiming ? a.dir : nearestHero(s, ctl.x, ctl.y)
    ctl.aiming = true
  } else if (attackHeld) {
    attackHeld = false
    fire('attack', a.aiming, a.dir)
    ctl.aim = null
    ctl.aiming = false
  } else if (sp.held && enemy.kind === 'king') {
    specialHeld = true
    ctl.aim = sp.aiming ? sp.dir : nearestHero(s, ctl.x, ctl.y)
    ctl.aiming = true
  } else if (specialHeld) {
    specialHeld = false
    fire('special', sp.aiming, sp.dir)
    ctl.aim = null
    ctl.aiming = false
  }
}
