// Balance numbers. The designer owns those listed in DESIGN.md "Números"; change them only on request.
export const TEAM_LIVES = 3
// One more team life with 4 heroes (designer, 2026-11-21).
export const teamLives = (heroes: number) => TEAM_LIVES + (heroes >= 4 ? 1 : 0)
export const HERO_HITS = 4
export const MAX_ROOMS = 5 // master rooms before the boss room (the start room does not count; designer 2026-11-21)
export const ROOM_DIFFICULTY_CAP = 10
export const CAP_PER_EXTRA_HERO = 5
// Enemies (placed one by one) and the room layout (broken floor, spike pack, each chest) share the room's cap.
export const DIFFICULTY = { slime: 2, thrower: 3, ogre: 5, brokenFloor: 4, spikes: 3, chest: -5 } as const
// Chests per room by number of heroes: 1, 2, 2, 3.
export const maxChests = (heroes: number) => [1, 1, 2, 2, 3][Math.max(0, Math.min(4, heroes))]
// Spikes: each group cycles down -> warn -> up; group B runs half a cycle after group A.
export const SPIKE_CYCLE = { down: 1.5, warn: 0.5, up: 1 } as const
// Cap of every room for a match with `heroes` heroes.
export const roomCap = (heroes: number) => ROOM_DIFFICULTY_CAP + CAP_PER_EXTRA_HERO * Math.max(0, heroes - 1)
// Chests give potions to the team's shared stock (designer 2026-11-21): 1, or 2 with `doubleChance`. A potion is drunk
// by itself when a hit leaves a hero with `drinkAt` hits or fewer, and heals `heal`.
export const POTION = { heal: 2, doubleChance: 0.2, drinkAt: 1 } as const
export const RESPAWN_SECONDS = 1
export const ENEMY_TELEGRAPH = 0.5 // seconds a red zone / aim line shows before an enemy strikes
export const ENEMY_HIT_STUN = 0.25
export const START_ROOM_SLIMES = 2
export const CHARGE_TIME = 0.6 // seconds holding attack for the powered attack
export const BOSS_HP = 30
// +5% boss life per hero after the first (designer 2026-11-21).
export const bossHp = (heroes: number) => BOSS_HP * (1 + 0.05 * Math.max(0, heroes - 1))
export const CINEMATIC_SECONDS = 4 // boss entrance: the Maestro possesses the boss (proposal)
// Seconds before the Maestro can summon again: after a slime summoned into a fight, or anywhere else (designer,
// 2026-11-22). It never lands closer than `minHeroDistance` cells to a hero, and does not count toward the room's cap.
export const SUMMON = { fightCooldown: 30, calmCooldown: 60, minHeroDistance: 2.5 } as const

// Feel and tuning values chosen by the agent (not in DESIGN.md).
export const MAX_HEROES = 4
export const ROOM_W = 11 // cells
export const ROOM_H = 13 // cells
export const DOOR_HALF = 1 // half width of a doorway, cells
export const HERO_SPEED = 4.2
export const HERO_RADIUS = 0.35

export const HERO = {
  melee: {
    basic: { range: 1.7, arc: Math.PI * 0.6, damage: 1, cooldown: 0.38 },
    charged: { range: 2.6, damage: 2, cooldown: 0.5 },
  },
  ranged: {
    basic: { range: 6, speed: 13, damage: 1, cooldown: 0.42 },
    charged: { range: 9, speed: 22, damage: 3, cooldown: 0.5 },
  },
  priest: {
    basic: { range: 6, speed: 10, damage: 1, heal: 1, cooldown: 0.42, mana: 1 },
    charged: { range: 3.5, heal: 1, cooldown: 0.5, mana: 3 },
  },
  mage: {
    basic: { range: 5, speed: 12, damage: 1, cooldown: 0.42, mana: 1 },
    charged: { range: 7, speed: 16, cooldown: 0.5, mana: 3 },
  },
} as const

// Mana (priestess and mage): max and seconds to recover one point.
export const MANA = { priest: { max: 4, regen: 1.5 }, mage: { max: 5, regen: 1.2 } } as const
export const BURN = { perSecond: 0.5, seconds: 2 } as const
// Untouched chickens last 50% longer; the first damage cuts it back to the short duration (from when it began).
export const POLYMORPH = { seconds: 4, bossSeconds: 1.5, untouchedBonus: 1.5, bossImmune: 8, fleeSpeed: 1.6 } as const

export const ENEMY = {
  slime: { hp: 3, radius: 0.4, speed: 2.1, touchCooldown: 0.8 },
  thrower: { hp: 2, radius: 0.4, speed: 1.8, keepMin: 3.2, keepMax: 6, cooldown: 2.2, orbSpeed: 6, orbRange: 9 },
  ogre: { hp: 10, radius: 0.75, speed: 1.5, reach: 2.4, slamAhead: 1.3, slamRadius: 1.5, slamHits: 2, cooldown: 2.8, recover: 0.8 },
  king: { hp: BOSS_HP, radius: 1.15, speed: 1.3, touchCooldown: 1, jumpEvery: 4.5, jumpRadius: 1.8, fanEvery: 6, fanOrbs: 5 },
} as const

export const ENEMY_KNOCKBACK = 0.35
export const HIT_INVULNERABLE = 0.8
export const RESPAWN_INVULNERABLE = 2 // seconds of protection after reappearing
export const TICK_HZ = 20

// The Maestro controlling an enemy (agent's feel values): the slime's attack is a short dash; the boss jumps up to
// `kingJump` cells in the aimed direction.
// The Maestro's own body (designer, 2026-11-22): a bit under twice a hero's speed (-12% after the first playtest), 70% while crossing a wall (`wallBand` cells
// on each side of it); its smoke trail into a possessed enemy lasts `smokeSeconds`.
export const LORD = { speed: 7.4, wallSpeed: 0.7, wallBand: 0.6, smokeSeconds: 0.5 } as const
export const POSSESS = { dashSeconds: 0.3, dashSpeed: 3, dashCooldown: 0.9, kingJump: 4.5, autoAim: 9 } as const

// Netcode tolerances (server checks on what devices report).
export const MOVE_TOLERANCE = 1.5
export const HIT_RANGE_TOLERANCE = 0.8
export const MAX_VIEW_DELAY = 0.6
export const STRIKE_CLAIM_WINDOW = 1.2
