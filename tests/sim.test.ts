// Rules from DESIGN.md and the netcode checks, on the pure simulation (run with `npm test`).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as R from '../src/shared/rules.ts'
import { createGame, hit, place, remove, reportPosition, reportStruck, step, type Game } from '../src/shared/sim.ts'

function run(game: Game, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) step(game, 0.05)
}

function enemy(id: number, x: number, y: number) {
  return { id, x, y, hp: R.ENEMY_HP, state: 'chase' as const, stateTime: 0, cooldown: 99, stun: 0, strike: 0 }
}

test('a new game: team lives, full hit bars, master points, first room with enemies', () => {
  const g = createGame(['a', 'b'])
  assert.equal(g.lives, R.TEAM_LIVES)
  assert.equal(g.points, R.MASTER_START_POINTS)
  assert.ok(g.heroes.every((h) => h.hp === R.HERO_HITS))
  assert.equal(g.enemies.length, R.FIRST_ROOM_ENEMIES)
})

test('the master pays to place in the next room and gets the cost back on removal', () => {
  const g = createGame(['a'])
  assert.ok(place(g, 'enemy', 4, 6))
  assert.equal(g.points, R.MASTER_START_POINTS - R.COST.enemy)
  assert.equal(place(g, 'trap', 4, 6), false, 'cell already used')
  assert.equal(place(g, 'trap', 4, 0), false, 'entrance rows are not buildable')
  assert.ok(remove(g, 4, 6))
  assert.equal(g.points, R.MASTER_START_POINTS)
})

test('the master cannot spend points it does not have', () => {
  const g = createGame(['a'])
  g.points = 1
  assert.equal(place(g, 'enemy', 3, 5), false)
  assert.ok(place(g, 'trap', 3, 5))
})

test('the device owns its hero position, within the speed limit and the current epoch', () => {
  const g = createGame(['a'])
  const hero = g.heroes[0]
  const start = { x: hero.x, y: hero.y }
  run(g, 0.5)
  reportPosition(g, 'a', start.x, start.y + 1, hero.epoch)
  assert.equal(hero.y, start.y + 1, 'a plausible move is accepted as is')
  reportPosition(g, 'a', start.x, 12, hero.epoch)
  assert.ok(hero.y < 12, 'a teleport is cut down to the allowed distance')
  const y = hero.y
  run(g, 0.5)
  reportPosition(g, 'a', start.x, y + 0.5, hero.epoch - 1)
  assert.equal(hero.y, y, 'a report from before a server move is ignored')
})

test('hits give the master points; an emptied bar costs one team life and the hero respawns full', () => {
  const g = createGame(['a'])
  g.enemies = []
  g.items = [{ id: 99, kind: 'trap', cx: 4, cy: 4 }]
  const hero = g.heroes[0]
  hero.x = 4.5
  hero.y = 4.5
  for (let i = 0; i < 400 && !hero.dead; i++) step(g, 0.05)
  assert.equal(g.lives, R.TEAM_LIVES - 1)
  assert.equal(g.points, R.MASTER_START_POINTS + R.HERO_HITS * R.POINTS_PER_HIT)
  g.items = []
  const epoch = hero.epoch
  run(g, R.RESPAWN_SECONDS + 0.1)
  assert.equal(hero.dead, false)
  assert.equal(hero.hp, R.HERO_HITS)
  assert.equal(hero.epoch, epoch + 1, 'the respawn moves the hero: the device must adopt it')
})

test('the master wins when the team has no lives left', () => {
  const g = createGame(['a'])
  g.lives = 1
  g.heroes[0].hp = 1
  g.enemies = []
  g.items = [{ id: 99, kind: 'trap', cx: 4, cy: 4 }]
  g.heroes[0].x = 4.5
  g.heroes[0].y = 4.5
  run(g, 0.2)
  assert.equal(g.result, 'master-won')
})

test('wounds carry over; a chest heals; the door leads to the planned room and moves the heroes', () => {
  const g = createGame(['a'])
  const hero = g.heroes[0]
  g.enemies = []
  hero.hp = 1
  place(g, 'chest', 4, 2)
  place(g, 'enemy', 1, 9)
  hero.x = R.ROOM_W / 2
  hero.y = R.ROOM_H - 0.4
  const epoch = hero.epoch
  run(g, 0.1)
  assert.equal(g.room, 2)
  assert.equal(hero.epoch, epoch + 1)
  assert.equal(hero.hp, 1, 'wounds persist between rooms')
  assert.equal(g.enemies.length, 1)
  hero.x = 4.5
  hero.y = 2.5
  run(g, 0.1)
  assert.equal(hero.hp, 1 + R.CHEST_HEAL)
  assert.equal(g.items.length, 0)
})

test('the heroes win by leaving the last room', () => {
  const g = createGame(['a'])
  g.room = R.ROOMS_TO_WIN
  g.enemies = []
  g.heroes[0].x = R.ROOM_W / 2
  g.heroes[0].y = R.ROOM_H - 0.4
  run(g, 0.1)
  assert.equal(g.result, 'heroes-won')
})

test('a hit seen on the device counts if the enemy was in range where the device saw it', () => {
  const g = createGame(['a'])
  g.enemies = [enemy(1, 4.5, 3)]
  const hero = g.heroes[0]
  hero.x = 4.5
  hero.y = 1
  run(g, 0.3) // history: the enemy was at y = 3
  g.enemies[0].y = 8 // it then moved away on the server
  assert.ok(hit(g, 'a', 1, 0.2), 'checked against where it was 0.2 s ago')
  assert.equal(g.enemies[0].hp, R.ENEMY_HP - 1)
  assert.ok(g.enemies[0].stun > 0, 'a hit stuns the enemy')
  assert.equal(hit(g, 'a', 1, 0.2), false, 'cooldown')
  run(g, R.ATTACK_COOLDOWN)
  assert.equal(hit(g, 'a', 1, 0), false, 'out of range where it is now and no delay given')
})

test('an enemy announces its strike; only heroes whose device reports it lose a hit, once per strike', () => {
  const g = createGame(['a', 'b'])
  g.enemies = [{ ...enemy(1, 4.5, 3), cooldown: 0 }]
  const [a, b] = g.heroes
  a.x = 4.5
  a.y = 2.2
  b.x = 5
  b.y = 2.5
  step(g, 0.05)
  assert.equal(g.enemies[0].state, 'windup')
  assert.equal(g.strikes.length, 1)
  const strike = g.strikes[0]
  assert.equal(a.hp, R.HERO_HITS, 'nothing happens during the telegraph')
  run(g, R.ENEMY_TELEGRAPH)
  assert.ok(reportStruck(g, 'a', strike.id))
  assert.equal(reportStruck(g, 'a', strike.id), false, 'once per strike')
  assert.equal(a.hp, R.HERO_HITS - 1)
  assert.equal(b.hp, R.HERO_HITS, 'b dodged on its own screen and did not report')
  run(g, R.STRIKE_CLAIM_WINDOW + 0.2)
  assert.equal(reportStruck(g, 'b', strike.id), false, 'too late')
})
