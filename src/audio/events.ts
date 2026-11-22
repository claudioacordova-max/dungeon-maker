// Sounds for what happens in the shared match, found by comparing each server snapshot with the previous one.
// The own hero's actions sound at once from game/hero.ts instead; here they are skipped to avoid doubles.
// Volume falls with distance from the own hero (the master hears everything at full volume).
import { feedback, local } from '../game/hero'
import type { Snapshot } from '../shared/protocol'
import { sfx } from './sfx'

const HEAR = 16 // cells: beyond this, events are silent

function volumeAt(x: number, y: number, isHero: boolean) {
  if (!isHero || !local.ready) return 1
  const d = Math.hypot(x - local.x, y - local.y)
  return Math.max(0, 1 - d / HEAR)
}

export function playSnapshotSounds(prev: Snapshot | null, next: Snapshot, you: string, isHero: boolean) {
  if (!prev) return
  const now = performance.now()

  // Enemies: deaths, hurts, wind-ups, boss jumps and landings.
  const nextEnemies = new Map(next.enemies.map((e) => [e.id, e]))
  for (const e of prev.enemies) {
    const n = nextEnemies.get(e.id)
    const v = volumeAt(e.x, e.y, isHero)
    if (!n) {
      if (e.kind === 'slime') sfx.slimeDie(v)
      else if (e.kind === 'thrower') sfx.throwerDie(v)
      else if (e.kind === 'ogre') sfx.ogreDie(v)
      else sfx.bossDie(1)
      continue
    }
    if (n.chicken !== e.chicken) sfx.poof(v)
    if (e.kind === 'ogre' && e.state === 'windup' && n.state !== 'windup' && !n.chicken) sfx.ogreSlam(v)
    const ownHit = (feedback.enemyFlash.get(e.id) ?? 0) > now - 250
    if (n.stunned && !e.stunned && !ownHit) sfx.enemyHurt(v * 0.7)
    if (n.state === 'windup' && e.state !== 'windup') sfx.aim(v)
    if (n.state === 'jump' && e.state !== 'jump') sfx.bossJump(1)
    if (e.state === 'jump' && n.state !== 'jump') sfx.bossLand(v)
  }

  // The Maestro: a summoned slime, taking or dropping an enemy, the boss entrance.
  const prevIds = new Set(prev.enemies.map((e) => e.id))
  if (next.summonIn > prev.summonIn + 1) {
    const slime = next.enemies.find((e) => !prevIds.has(e.id) && e.kind === 'slime')
    sfx.summon(slime ? volumeAt(slime.x, slime.y, isHero) : 1)
  }
  if (next.possessed !== prev.possessed && (next.possessed !== null || !isHero)) {
    const e = next.enemies.find((x) => x.id === (next.possessed ?? prev.possessed))
    sfx.possess(e ? volumeAt(e.x, e.y, isHero) : 1)
  }
  if (next.cinematic && !prev.cinematic) sfx.entrance(1)

  // Enemy orbs thrown.
  const prevOrbs = new Set(prev.orbs.map((o) => o.id))
  for (const o of next.orbs) if (!prevOrbs.has(o.id)) sfx.orbThrow(volumeAt(o.x, o.y, isHero) * 0.8)

  // Heroes: hurt, down, back; the others' attacks.
  const prevHeroes = new Map(prev.heroes.map((h) => [h.id, h]))
  for (const h of next.heroes) {
    const p = prevHeroes.get(h.id)
    if (!p) continue
    const own = h.id === you
    const v = own ? 1 : volumeAt(h.x, h.y, isHero) * 0.7
    if (h.dead && !p.dead) sfx.heroDie(v)
    else if (!h.dead && p.dead) sfx.respawn(v)
    else if (h.hp < p.hp && !own) sfx.heroHurt(v)
    else if (h.drinks > p.drinks) sfx.potion(own ? 1 : v)
    else if (h.heals > p.heals) sfx.heal(v)
    if (!own && h.act && h.act.seq !== p.act?.seq) {
      const charged = h.act.kind === 'charged'
      if (h.cls === 'melee') (charged ? sfx.spin : sfx.swing)(v * 0.6)
      else if (h.cls === 'ranged') (charged ? sfx.critShot : sfx.shot)(v * 0.6)
      else if (h.cls === 'priest') (charged ? sfx.prayer : sfx.light)(v * 0.6)
      else (charged ? sfx.polyCast : sfx.spark)(v * 0.6)
    }
  }

  // Chests opened.
  const prevItems = new Map(prev.items.map((i) => [i.id, i]))
  for (const i of next.items) if (i.opened && prevItems.get(i.id)?.opened === false) sfx.chest(volumeAt(i.x, i.y, isHero))

  // Traps that fired on someone (a hit while standing on one is shown by the hurt sound).
  // Rooms: a door opens when a room is cleared; the master's building.
  const prevRooms = new Map(prev.rooms.map((r) => [r.id, r]))
  for (const r of next.rooms) {
    const p = prevRooms.get(r.id)
    if (!p) {
      if (!isHero) sfx.build()
      continue
    }
    if (p.enemies > 0 && r.enemies === 0 && r.ready) sfx.door(isHero ? 0.8 : 0.6)
    if (!isHero) {
      if (r.ready && !p.ready) sfx.ready()
      const before = p.plan?.length ?? 0
      const after = r.plan?.length ?? 0
      if (after > before) sfx.place()
      else if (after < before) sfx.remove()
    }
  }
}
