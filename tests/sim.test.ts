// Rules from DESIGN.md (v2) and the netcode checks, on the pure simulation (run with `npm test`).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildableSlots, difficulty, doorState, walkable } from '../src/shared/map.ts'
import { CHEST_SLOTS, floorCell, SHAPES, SPIKES } from '../src/shared/layouts.ts'
import * as R from '../src/shared/rules.ts'
import {
  attack,
  build,
  createGame as createGameRaw,
  demolish,
  enemyAct,
  introReady,
  possess,
  release,
  reportRam,
  steer,
  summon,
  openChest,
  place,
  removeItem,
  reportOrb,
  reportPosition,
  reportStruck,
  reportTouched,
  setLayout,
  setReady,
  shotHit,
  spikePhase,
  shotHeal,
  step,
  type Game,
} from '../src/shared/sim.ts'

// Most tests skip the intro (every hero already pressed "Entrar a la mazmorra").
function createGame(heroes: Parameters<typeof createGameRaw>[0]) {
  const g = createGameRaw(heroes)
  g.intro.clear()
  return g
}

function run(game: Game, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) step(game, 0.05)
}

const start = (g: Game) => g.rooms[0]

test('a new game: start room with two slimes, team lives, full hit bars, heroes with their class', () => {
  const g = createGame([
    { id: 'a', cls: 'melee' },
    { id: 'b', cls: 'ranged' },
  ])
  assert.equal(g.lives, R.TEAM_LIVES)
  assert.ok(g.heroes.every((h) => h.hp === R.HERO_HITS))
  assert.deepEqual(g.heroes.map((h) => h.cls), ['melee', 'ranged'])
  assert.equal(g.enemies.filter((e) => e.kind === 'slime').length, R.START_ROOM_SLIMES)
})

test('the master builds north, east or west of existing rooms; 5 rooms, then the boss room, which is the last', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  assert.equal(build(g, 0, -1, 'normal'), false, 'never back south')
  assert.equal(build(g, 0, 1, 'boss'), false, 'the boss room needs the 5 rooms first')
  const slots = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, 2],
    [1, 1],
  ]
  for (const [gx, gy] of slots) assert.ok(build(g, gx, gy, 'normal'), `room at ${gx},${gy}`)
  assert.equal(build(g, 0, 3, 'normal'), false, 'no 6th normal room')
  assert.ok(build(g, 0, 3, 'boss'))
  assert.equal(build(g, 1, 2, 'normal'), false, 'nothing after the boss room')
  assert.ok(buildableSlots(g.rooms).length > 0)
})

test('difficulty per room: enemies and the layout share the cap; chests subtract, at most 3', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  build(g, 0, 1, 'normal')
  const room = g.rooms[1]
  for (let i = 0; i < 5; i++) assert.ok(place(g, room.id, 'slime', 1 + i, 3))
  assert.equal(difficulty(room.plan, room.layout), 10)
  assert.equal(setLayout(g, room.id, 'full', true, 0), false, 'spikes would pass the cap')
  assert.ok(setLayout(g, room.id, 'full', true, 1), 'a chest pays for the spikes')
  assert.equal(difficulty(room.plan, room.layout), 8)
  assert.equal(setLayout(g, room.id, 'full', true, 2), false, 'one hero: at most 1 chest')
  assert.equal(setLayout(g, room.id, 'full', false, 0), true)
  assert.equal(place(g, room.id, 'thrower', 6, 6), false, 'over the cap')
  assert.equal(setLayout(g, room.id, 'nope', false, 0), false)
})

test('layouts: every spike and chest is on floor; enemies cannot stand over the abyss', () => {
  for (const shape of SHAPES) {
    for (const [cx, cy] of [...SPIKES[shape], ...CHEST_SLOTS[shape]]) assert.ok(floorCell(shape, cx, cy), `${shape} ${cx},${cy}`)
    const chests = new Set(CHEST_SLOTS[shape].map(([x, y]) => `${x},${y}`))
    for (const [cx, cy] of SPIKES[shape]) assert.ok(!chests.has(`${cx},${cy}`), `${shape}: chest on a spike`)
  }
  const g = createGame([{ id: 'a', cls: 'melee' }])
  build(g, 0, 1, 'normal')
  const room = g.rooms[1]
  assert.ok(place(g, room.id, 'slime', 1, 1))
  assert.ok(setLayout(g, room.id, 'banks', false, 0))
  assert.equal(room.plan.length, 0, 'the slime over the gap is removed')
  assert.equal(place(g, room.id, 'slime', 1, 1), false)
  assert.ok(place(g, room.id, 'slime', 5, 1))
})

test('walking off the edge is a fall: the team loses a life; spikes hurt only while up', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  g.enemies = []
  build(g, 0, 1, 'normal')
  const room = g.rooms[1]
  setLayout(g, room.id, 'banks', true, 0)
  setReady(g, room.id, true)
  const hero = g.heroes[0]
  hero.invulnerable = 5
  hero.x = 1
  hero.y = R.ROOM_H + 2
  step(g, 0.05)
  assert.ok(hero.dead, 'fell even while protected')
  assert.equal(g.lives, R.TEAM_LIVES - 1)
  run(g, R.RESPAWN_SECONDS + 0.2)
  assert.ok(!hero.dead)
  const spike = g.items.find((i) => i.kind === 'trap')!
  hero.invulnerable = 0
  hero.x = spike.x
  hero.y = spike.y
  let hurt = false
  let downTime = 0
  for (let t = 0; t < 3; t += 0.05) {
    const before = hero.hp
    const phase = spikePhase(g.time + 0.05, spike.group)
    step(g, 0.05)
    if (hero.hp < before) {
      hurt = true
      assert.equal(phase, 'up')
    }
    if (phase !== 'up') downTime += 0.05
    hero.invulnerable = 0
    hero.hp = R.HERO_HITS
  }
  assert.ok(hurt && downTime > 1.5)
})

test('a door to a room still being built is locked; ready rooms open once one side has no enemies', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  build(g, 0, 1, 'normal')
  const room = g.rooms[1]
  place(g, room.id, 'slime', 4, 4)
  assert.equal(doorState(g.rooms, start(g), 'n'), 'locked')
  setReady(g, room.id, true)
  assert.equal(doorState(g.rooms, start(g), 'n'), 'closed', 'both rooms still have enemies')
  g.enemies = g.enemies.filter((e) => e.room !== start(g).id)
  run(g, 0.05)
  assert.equal(doorState(g.rooms, start(g), 'n'), 'open')
  const doorX = R.ROOM_W / 2
  assert.ok(walkable(g.rooms, doorX, R.ROOM_H, R.HERO_RADIUS), 'the doorway is walkable')
  assert.equal(walkable(g.rooms, 2, R.ROOM_H, R.HERO_RADIUS), false, 'the wall is not')
})

test('the master cannot edit a room a hero has entered, and can demolish only unfinished leaf rooms', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  build(g, 0, 1, 'normal')
  build(g, 0, 2, 'normal')
  const [, r1, r2] = g.rooms
  assert.equal(demolish(g, r1.id), false, 'r2 depends on it')
  assert.ok(demolish(g, r2.id))
  setReady(g, r1.id, true)
  g.enemies = []
  run(g, 0.05)
  const hero = g.heroes[0]
  run(g, 1)
  reportPosition(g, 'a', R.ROOM_W / 2, R.ROOM_H - 1, 0, hero.epoch)
  for (let i = 0; i < 6; i++) {
    run(g, 0.5)
    reportPosition(g, 'a', R.ROOM_W / 2, R.ROOM_H + 1 + i, 0, hero.epoch)
  }
  assert.ok(r1.entered)
  assert.equal(place(g, r1.id, 'slime', 3, 3), false)
})

test('device positions: plausible moves accepted, teleports cut, walls refused, stale epochs ignored', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  const hero = g.heroes[0]
  const y0 = hero.y
  run(g, 0.5)
  reportPosition(g, 'a', hero.x, y0 + 1, 0, hero.epoch)
  assert.equal(hero.y, y0 + 1)
  reportPosition(g, 'a', hero.x, 12, 0, hero.epoch)
  assert.ok(hero.y < 12)
  const y1 = hero.y
  run(g, 0.5)
  reportPosition(g, 'a', hero.x, y1 + 0.5, 0, hero.epoch - 1)
  assert.equal(hero.y, y1)
})

test('melee: the hits the device saw count if plausible; cooldown applies; charged hits harder', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  const hero = g.heroes[0]
  const [s1, s2] = g.enemies
  s1.x = hero.x + 1
  s1.y = hero.y
  s2.x = hero.x + 8
  s2.y = hero.y + 8
  run(g, 0.1)
  s1.x = hero.x + 1
  s1.y = hero.y
  assert.ok(attack(g, 'a', 1, 'basic', 0, [s1.id, s2.id], 0.1))
  assert.equal(s1.hp, R.ENEMY.slime.hp - R.HERO.melee.basic.damage)
  assert.equal(s2.hp, R.ENEMY.slime.hp, 'too far: refused')
  assert.equal(attack(g, 'a', 2, 'basic', 0, [s1.id], 0.1), null, 'cooldown')
  run(g, 0.5)
  s1.x = hero.x + 1
  s1.y = hero.y
  attack(g, 'a', 3, 'charged', 0, [s1.id], 0)
  assert.ok(!g.enemies.includes(s1), 'the charged hit finished it')
})

test('ranged: a shot flies for everyone; its hit counts once; the precise shot is a critical', () => {
  const g = createGame([{ id: 'a', cls: 'ranged' }])
  const hero = g.heroes[0]
  const slime = g.enemies[0]
  slime.x = hero.x
  slime.y = hero.y + 4
  run(g, 0.1)
  const seq = attack(g, 'a', 4, 'basic', Math.PI / 2, [], 0)!
  assert.equal(g.shots.length, 1)
  assert.ok(shotHit(g, 'a', seq, slime.id, 0.1))
  assert.equal(shotHit(g, 'a', seq, slime.id, 0.1), false, 'once')
  run(g, 0.5)
  const crit = attack(g, 'a', 5, 'charged', Math.PI / 2, [], 0)!
  assert.ok(shotHit(g, 'a', crit, slime.id, 0))
  assert.ok(!g.enemies.includes(slime))
})

test('slime contact, thrower orbs and boss jumps hurt only when the device reports them, with cooldowns', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  const hero = g.heroes[0]
  const slime = g.enemies[0]
  slime.x = hero.x + 0.6
  slime.y = hero.y
  assert.ok(reportTouched(g, 'a', slime.id))
  assert.equal(reportTouched(g, 'a', slime.id), false, 'touch cooldown')
  assert.equal(hero.hp, R.HERO_HITS - 1)
  run(g, 1)
  // A thrower aims (telegraph) then throws an orb.
  g.enemies = []
  build(g, 0, 1, 'normal')
  const room = g.rooms[1]
  place(g, room.id, 'thrower', 5, 2)
  setReady(g, room.id, true)
  const thrower = g.enemies.find((e) => e.kind === 'thrower')!
  thrower.cooldown = 0
  hero.x = thrower.x
  hero.y = thrower.y + 4
  step(g, 0.05)
  assert.equal(thrower.state, 'windup')
  run(g, R.ENEMY_TELEGRAPH + 0.1)
  assert.equal(g.orbs.length, 1)
  const hp = hero.hp
  hero.invulnerable = 0
  assert.ok(reportOrb(g, 'a', g.orbs[0].id))
  assert.equal(hero.hp, hp - 1)
  assert.equal(g.orbs.length, 0, 'the orb bursts for everyone')
})

test('the boss jump is an announced strike; defeating the boss wins; no lives left loses', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  for (const [gx, gy] of [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]) build(g, gx, gy, 'normal')
  assert.ok(build(g, 0, 6, 'boss'))
  const boss = g.rooms.at(-1)!
  setReady(g, boss.id, true)
  const king = g.enemies.find((e) => e.kind === 'king')!
  assert.equal(king.hp, R.BOSS_HP)
  assert.ok(boss.ready, 'the boss room is predesigned and ready at once')
  const hero = g.heroes[0]
  hero.x = king.x
  hero.y = king.y - 3
  king.cooldown = 0
  step(g, 0.05)
  assert.equal(king.state, 'jump')
  const strike = g.strikes[0]
  run(g, R.ENEMY_TELEGRAPH)
  assert.ok(reportStruck(g, 'a', strike.id))
  king.hp = 1
  run(g, 0.5)
  hero.x = king.x + 1
  hero.y = king.y
  attack(g, 'a', 6, 'basic', 0, [king.id], 0)
  assert.equal(g.result, 'heroes-won')

  const g2 = createGame([{ id: 'a', cls: 'melee' }])
  g2.lives = 1
  g2.heroes[0].hp = 1
  const s = g2.enemies[0]
  s.x = g2.heroes[0].x + 0.5
  s.y = g2.heroes[0].y
  reportTouched(g2, 'a', s.id)
  assert.equal(g2.result, 'master-won')
})

test('a chest opens when a hero hits it and gives the team potions; it stays shut when walked over', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  g.enemies = []
  build(g, 0, 1, 'normal')
  const room = g.rooms[1]
  setLayout(g, room.id, 'full', false, 1)
  setReady(g, room.id, true)
  const chest = g.items.find((i) => i.kind === 'chest')!
  const hero = g.heroes[0]
  hero.hp = 1
  hero.x = chest.x
  hero.y = chest.y
  run(g, 0.2)
  assert.equal(hero.hp, 1, 'walking over it does nothing')
  assert.equal(openChest(g, 'a', chest.id), false, 'no attack yet')
  attack(g, 'a', 1, 'basic', 0, [], 0)
  g.rand = () => 0.5
  assert.ok(openChest(g, 'a', chest.id))
  assert.equal(hero.hp, 1, 'no heal on the spot')
  assert.equal(g.potions, 1)
  assert.equal(openChest(g, 'a', chest.id), false, 'already open')
  run(g, 1.5)
  assert.ok(!g.items.includes(chest), 'it vanishes after opening')
})

test('cap per room grows 5 per extra hero; the ogre costs 5', () => {
  assert.equal(createGame([{ id: 'a', cls: 'melee' }]).cap, 10)
  const ids = ['a', 'b', 'c', 'd'].map((id) => ({ id, cls: 'melee' as const }))
  assert.equal(createGame(ids.slice(0, 2)).cap, 15)
  const g = createGame(ids)
  assert.equal(g.cap, 25)
  assert.deepEqual([1, 2, 3, 4].map((n) => [createGame(ids.slice(0, n)).maxChests, createGame(ids.slice(0, n)).lives]), [[1, 3], [2, 3], [2, 3], [3, 4]])
  build(g, 0, 1, 'normal')
  const room = g.rooms[1]
  for (let i = 0; i < 5; i++) assert.ok(place(g, room.id, 'ogre', 1 + i, 3))
  assert.equal(difficulty(room.plan, room.layout), 25)
  assert.equal(place(g, room.id, 'slime', 1, 5), false, 'over the 4-hero cap')
})

test('mana: priestess and mage spend it and it recovers; no mana, no attack', () => {
  const g = createGame([{ id: 'a', cls: 'mage' }])
  const hero = g.heroes[0]
  assert.equal(hero.mana, R.MANA.mage.max)
  let seq = 1
  for (let i = 0; i < 5; i++) {
    assert.ok(attack(g, 'a', seq++, 'basic', 0, [], 0))
    run(g, R.HERO.mage.basic.cooldown)
  }
  hero.mana = 0
  assert.equal(attack(g, 'a', seq++, 'basic', 0, [], 0), null)
  run(g, R.MANA.mage.regen * 3 + 0.1)
  assert.ok(attack(g, 'a', seq++, 'charged', 0, [], 0), 'polymorph needs 3')
})

test('priestess: the orb hurts enemies and heals allies once; the prayer heals everyone close', () => {
  const g = createGame([
    { id: 'p', cls: 'priest' },
    { id: 'b', cls: 'melee' },
    { id: 'c', cls: 'melee' },
  ])
  const [priest, b, c] = g.heroes
  b.hp = 1
  c.hp = 1
  b.x = priest.x + 2
  b.y = priest.y
  c.x = priest.x + 20
  const seq = attack(g, 'p', 1, 'basic', 0, [], 0)!
  assert.ok(shotHeal(g, 'p', seq, 'b'))
  assert.equal(b.hp, 2)
  assert.equal(shotHeal(g, 'p', seq, 'b'), false, 'once per orb and ally')
  assert.equal(shotHeal(g, 'p', seq, 'c'), false, 'too far')
  const slime = g.enemies[0]
  slime.x = priest.x + 3
  slime.y = priest.y
  run(g, 0.1)
  assert.ok(shotHit(g, 'p', seq, slime.id, 0))
  assert.equal(slime.hp, R.ENEMY.slime.hp - 1)
  run(g, 0.5)
  priest.hp = 2
  c.x = priest.x + 1
  attack(g, 'p', 2, 'charged', 0, [], 0)
  assert.deepEqual([priest.hp, b.hp, c.hp], [3, 3, 2])
})

test('mage: the spark burns; polymorph makes a harmless chicken, short and with a cooldown on the boss', () => {
  const g = createGame([{ id: 'a', cls: 'mage' }])
  const hero = g.heroes[0]
  const [s1, s2] = g.enemies
  s1.x = hero.x + 3
  s1.y = hero.y
  run(g, 0.1)
  const seq = attack(g, 'a', 1, 'basic', 0, [], 0)!
  assert.ok(shotHit(g, 'a', seq, s1.id, 0))
  run(g, R.BURN.seconds + 0.2)
  assert.equal(s1.hp, R.ENEMY.slime.hp - 1 - R.BURN.perSecond * R.BURN.seconds)
  s2.x = hero.x + 0.6
  s2.y = hero.y
  run(g, 0.1)
  const poly = attack(g, 'a', 2, 'charged', 0, [], 0)!
  assert.ok(shotHit(g, 'a', poly, s2.id, 0))
  assert.ok(s2.poly > 0)
  assert.equal(reportTouched(g, 'a', s2.id), false, 'a chicken does not hurt')
  run(g, R.POLYMORPH.seconds + 0.1)
  assert.ok(s2.poly > 0, 'untouched: lasts longer')
  run(g, R.POLYMORPH.seconds * (R.POLYMORPH.untouchedBonus - 1))
  assert.equal(s2.poly, 0)
  // Damage cuts it back to the short duration, counted from when it began.
  const p3 = attack(g, 'a', 3, 'charged', 0, [], 0)
  g.heroes[0].mana = R.MANA.mage.max
  const s3 = g.enemies.find((e) => e.hp > 0)!
  s3.x = hero.x + 1
  s3.y = hero.y
  if (p3) shotHit(g, 'a', p3, s3.id, 0)
  run(g, 1)
  const before = s3.hp
  const strike = attack(g, 'a', 4, 'basic', 0, [], 0)!
  assert.ok(shotHit(g, 'a', strike, s3.id, 0))
  assert.ok(s3.hp < before)
  assert.ok(Math.abs(s3.poly - (R.POLYMORPH.seconds - 1)) < 0.1, `cut back: ${s3.poly}`)

  // Boss
  const b = createGame([{ id: 'a', cls: 'mage' }])
  for (const [gx, gy] of [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]) build(b, gx, gy, 'normal')
  build(b, 0, 6, 'boss')
  setReady(b, b.rooms.at(-1)!.id, true)
  const king = b.enemies.find((e) => e.kind === 'king')!
  const mage = b.heroes[0]
  mage.x = king.x
  mage.y = king.y - 3
  king.cooldown = 0
  step(b, 0.05)
  assert.equal(b.strikes.length, 1, 'jump announced')
  const p1 = attack(b, 'a', 1, 'charged', Math.PI / 2, [], 0)!
  assert.ok(shotHit(b, 'a', p1, king.id, 0))
  assert.equal(king.poly, R.POLYMORPH.bossSeconds * R.POLYMORPH.untouchedBonus)
  assert.equal(b.strikes.length, 0, 'the announced jump is cancelled')
  run(b, R.POLYMORPH.bossSeconds * R.POLYMORPH.untouchedBonus + 1)
  mage.mana = R.MANA.mage.max
  const p2 = attack(b, 'a', 2, 'charged', Math.PI / 2, [], 0)!
  shotHit(b, 'a', p2, king.id, 0)
  assert.equal(king.poly, 0, 'boss immune for a while')
})

test('ogre: announced slam in front that takes 2 hits; the boss room cannot be edited', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  g.enemies = []
  build(g, 0, 1, 'normal')
  const room = g.rooms[1]
  place(g, room.id, 'ogre', 5, 5)
  setReady(g, room.id, true)
  const ogre = g.enemies.find((e) => e.kind === 'ogre')!
  const hero = g.heroes[0]
  hero.x = ogre.x
  hero.y = ogre.y - 1.5
  ogre.cooldown = 0
  step(g, 0.05)
  assert.equal(ogre.state, 'windup')
  run(g, R.ENEMY_TELEGRAPH)
  assert.ok(reportStruck(g, 'a', g.strikes[0].id))
  assert.equal(hero.hp, R.HERO_HITS - 2)

  const b = createGame([{ id: 'a', cls: 'melee' }])
  for (const [gx, gy] of [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]) build(b, gx, gy, 'normal')
  build(b, 0, 6, 'boss')
  const boss = b.rooms.at(-1)!
  assert.equal(place(b, boss.id, 'slime', 2, 2), false, 'predesigned: no enemies')
  assert.equal(setLayout(b, boss.id, 'cross', true, 1), false, 'predesigned: no traps or holes')
  assert.deepEqual(b.enemies.filter((e) => e.room === boss.id).map((e) => e.kind), ['king'])
  assert.equal(boss.enemies, 1)
})

test('potions: drunk by themselves when a hit leaves a hero at 1 or 0; they save a fatal hit, not a fall', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  const hero = g.heroes[0]
  const slime = g.enemies[0]
  g.potions = 3
  hero.hp = 2
  slime.x = hero.x + 0.5
  slime.y = hero.y
  assert.ok(reportTouched(g, 'a', slime.id))
  assert.equal(hero.hp, 3, '2 - 1 = 1, then a potion: 3')
  assert.equal(g.potions, 2)
  assert.equal(hero.drinks, 1)
  hero.hp = 2
  hero.invulnerable = 0
  const strike = { id: 99, owner: 0, x: hero.x, y: hero.y, r: 1, hits: 2, landsAt: g.time, claimed: new Set<string>() }
  g.strikes.push(strike)
  assert.ok(reportStruck(g, 'a', 99))
  assert.equal(hero.hp, 2, 'a 2-hit blow at 2 would down the hero: the potion leaves 2')
  assert.equal(g.lives, R.TEAM_LIVES)
  hero.hp = 4
  hero.invulnerable = 0
  g.strikes.push({ ...strike, id: 100, claimed: new Set<string>() })
  reportStruck(g, 'a', 100)
  assert.equal(hero.hp, 2, 'no potion while 2 or more remain')
  assert.equal(g.potions, 1)
  // A chest gives 2 potions with the double chance.
  g.enemies = []
  build(g, 0, 1, 'normal')
  setLayout(g, g.rooms[1].id, 'full', false, 1)
  setReady(g, g.rooms[1].id, true)
  const chest = g.items.find((i) => i.kind === 'chest')!
  hero.x = chest.x
  hero.y = chest.y
  attack(g, 'a', 1, 'basic', 0, [], 0)
  g.rand = () => 0.1
  assert.ok(openChest(g, 'a', chest.id))
  assert.equal(g.potions, 3)
})

test('intro: nothing moves until every hero pressed "Entrar a la mazmorra"; the Maestro can already build', () => {
  const g = createGameRaw([
    { id: 'a', cls: 'melee' },
    { id: 'b', cls: 'ranged' },
  ])
  const slime = g.enemies[0]
  const hero = g.heroes[0]
  slime.x = hero.x + 3
  slime.y = hero.y
  const x0 = slime.x
  for (let i = 0; i < 20; i++) step(g, 0.05)
  assert.equal(slime.x, x0)
  assert.equal(g.time, 0)
  assert.ok(build(g, 0, 1, 'normal'), 'building works during the intro')
  introReady(g, 'a')
  step(g, 0.05)
  assert.equal(g.time, 0, 'still one hero reading')
  introReady(g, 'b')
  run(g, 0.5)
  assert.ok(slime.x < x0, 'the match runs')
})

test('boss: hp +5% per extra hero; the entrance freezes everyone, then the Maestro controls the boss', () => {
  const ids = ['a', 'b', 'c', 'd'].map((id) => ({ id, cls: 'melee' as const }))
  assert.deepEqual([1, 2, 3, 4].map((n) => R.bossHp(n)), [30, 31.5, 33, 34.5])
  const g = createGame(ids.slice(0, 2))
  g.enemies = []
  for (const [gx, gy] of [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]) build(g, gx, gy, 'normal')
  build(g, 0, 6, 'boss')
  const room = g.rooms.at(-1)!
  const king = g.enemies.find((e) => e.kind === 'king')!
  assert.equal(king.hp, 31.5)
  const hero = g.heroes[0]
  hero.x = room.gx * R.ROOM_W + R.ROOM_W / 2
  hero.y = room.gy * R.ROOM_H + 0.8
  reportPosition(g, 'a', hero.x, hero.y + 0.2, 0, hero.epoch)
  assert.ok(g.cinematic, 'the first hero inside starts the entrance')
  const y = hero.y
  reportPosition(g, 'a', hero.x, y + 1, 0, hero.epoch)
  assert.equal(hero.y, y, 'heroes stand still')
  king.cooldown = 0
  run(g, R.CINEMATIC_SECONDS - 0.2)
  assert.equal(king.state, 'idle', 'the boss waits')
  run(g, 0.4)
  assert.equal(g.cinematic, null)
  assert.equal(g.possessed, king.id)
  assert.equal(release(g), false, 'the Maestro keeps the boss')
  // The Maestro's buttons: jump toward the aimed direction, fan of orbs.
  assert.ok(enemyAct(g, 'attack', -Math.PI / 2))
  assert.equal(king.state, 'jump')
  assert.ok(king.jumpTo.y < king.y)
  run(g, 1.2)
  king.cooldown2 = 0
  assert.ok(enemyAct(g, "special", 0))
  assert.equal(king.pending, 'fan')
})

test('possession: an enemy of a room with heroes; moved by the Maestro at its own speed; its attack', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  const slime = g.enemies[0]
  const hero = g.heroes[0]
  assert.ok(possess(g, slime.id))
  assert.equal(g.possessed, slime.id)
  const x0 = slime.x
  run(g, 0.5)
  assert.equal(slime.x, x0, 'no AI while possessed')
  steer(g, slime.x + 5, slime.y, 0)
  assert.ok(slime.x - x0 < 2, 'speed limited')
  assert.ok(slime.x > x0)
  slime.cooldown = 0
  assert.ok(enemyAct(g, 'attack', 0), 'the slime dashes')
  assert.equal(enemyAct(g, 'attack', 0), false, 'cooldown')
  assert.ok(release(g))
  assert.equal(g.possessed, null)
  // Rooms without heroes: no possession.
  g.enemies = []
  build(g, 0, 1, 'normal')
  place(g, g.rooms[1].id, 'thrower', 5, 5)
  setReady(g, g.rooms[1].id, true)
  const thrower = g.enemies.find((e) => e.kind === 'thrower')!
  assert.equal(possess(g, thrower.id), false)
  hero.x = thrower.x
  hero.y = thrower.y - 4
  assert.ok(possess(g, thrower.id))
  thrower.cooldown = 0
  assert.ok(enemyAct(g, 'attack', -Math.PI / 2))
  assert.equal(thrower.pending, 'throw')
  thrower.hp = 0
  step(g, 0.05)
  assert.equal(g.possessed, null, 'it ends when the enemy dies')
})

test('summon: one slime at the doorway farthest from the heroes, only while they fight, then a long wait', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  const room = start(g)
  const hero = g.heroes[0]
  hero.x = R.ROOM_W / 2
  hero.y = 2
  const before = g.enemies.length
  assert.ok(summon(g, room.id))
  assert.equal(g.enemies.length, before + 1)
  const slime = g.enemies.at(-1)!
  assert.equal(slime.kind, 'slime')
  assert.ok(slime.y > R.ROOM_H - 2, 'far from the hero (north doorway)')
  assert.equal(summon(g, room.id), false, 'cooldown')
  run(g, R.SUMMON_COOLDOWN)
  g.enemies = []
  assert.equal(summon(g, room.id), false, 'no fight, no summon')
})

test('possessed slime: its rams are reported by the Maestro (checked for distance and cooldown), not by the hero', () => {
  const g = createGame([{ id: 'a', cls: 'melee' }])
  const slime = g.enemies[0]
  const hero = g.heroes[0]
  assert.equal(reportRam(g, 'a'), false, 'nothing possessed')
  assert.ok(possess(g, slime.id))
  slime.x = hero.x + 5
  slime.y = hero.y
  assert.equal(reportRam(g, 'a'), false, 'too far here')
  slime.x = hero.x + 1.5 // the hero already stepped away on the server: within the tolerance
  assert.ok(reportRam(g, 'a'))
  assert.equal(hero.hp, R.HERO_HITS - 1)
  hero.invulnerable = 0
  assert.equal(reportRam(g, 'a'), false, 'touch cooldown')
  slime.x = hero.x + 0.4
  run(g, 1)
  hero.invulnerable = 0
  assert.equal(reportTouched(g, 'a', slime.id), false, 'the hero device does not report the possessed slime')
  assert.ok(reportRam(g, 'a'))
})
