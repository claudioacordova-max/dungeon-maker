// Rules from DESIGN.md, checked on the pure simulation (run with `npm test`).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as R from '../src/shared/rules.ts'
import { createGame, place, remove, setInput, step, type Game } from '../src/shared/sim.ts'

function run(game: Game, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) step(game, 0.05)
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

test('hits give the master points; an emptied bar costs one team life and the hero respawns full', () => {
  const g = createGame(['a'])
  g.enemies = []
  g.items = [{ id: 99, kind: 'trap', cx: 4, cy: 4 }]
  const hero = g.heroes[0]
  hero.x = 4.5
  hero.y = 4.5
  run(g, R.HIT_INVULNERABLE * R.HERO_HITS + 0.5)
  assert.equal(g.lives, R.TEAM_LIVES - 1)
  assert.equal(g.points, R.MASTER_START_POINTS + R.HERO_HITS * R.POINTS_PER_HIT)
  assert.ok(hero.dead)
  g.items = []
  run(g, R.RESPAWN_SECONDS + 0.2)
  assert.equal(hero.dead, false)
  assert.equal(hero.hp, R.HERO_HITS)
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

test('wounds carry over; a chest heals; the door opens when the room is clear and leads to the planned room', () => {
  const g = createGame(['a'])
  const hero = g.heroes[0]
  g.enemies = []
  hero.hp = 1
  place(g, 'chest', 4, 2)
  place(g, 'enemy', 1, 9)
  hero.x = R.ROOM_W / 2
  hero.y = R.ROOM_H - 0.5
  setInput(g, 'a', 0, 1)
  run(g, 0.2)
  assert.equal(g.room, 2)
  assert.equal(hero.hp, 1, 'wounds persist between rooms')
  assert.equal(g.enemies.length, 1)
  assert.equal(g.items.length, 1)
  setInput(g, 'a', 0, 0)
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
  g.heroes[0].y = R.ROOM_H - 0.5
  setInput(g, 'a', 0, 1)
  run(g, 0.2)
  assert.equal(g.result, 'heroes-won')
})

test('heroes attack the nearest enemy in range automatically', () => {
  const g = createGame(['a'])
  g.enemies = [{ id: 1, x: 5, y: 2, hp: R.ENEMY_HP, attackCd: 99 }]
  g.heroes[0].x = 4.5
  g.heroes[0].y = 1
  run(g, R.ATTACK_COOLDOWN * R.ENEMY_HP + 0.3)
  assert.equal(g.enemies.length, 0)
})
