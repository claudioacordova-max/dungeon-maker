// Balance numbers. The designer owns those listed in DESIGN.md "Números"; change them only on request.
export const TEAM_LIVES = 3
export const HERO_HITS = 4
export const MAX_ROOMS = 6 // master rooms before the boss room (the start room does not count)
export const ROOM_DIFFICULTY_CAP = 10
export const DIFFICULTY = { slime: 2, thrower: 3, trap: 1, chest: -5 } as const
export const CHEST_HEAL = 2
export const RESPAWN_SECONDS = 1
export const ENEMY_TELEGRAPH = 0.5 // seconds a red zone / aim line shows before an enemy strikes
export const ENEMY_HIT_STUN = 0.25
export const START_ROOM_SLIMES = 2
export const CHARGE_TIME = 0.6 // seconds holding attack for the powered attack
export const BOSS_HP = 30

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
} as const

export const ENEMY = {
  slime: { hp: 3, radius: 0.4, speed: 2.1, touchCooldown: 0.8 },
  thrower: { hp: 2, radius: 0.4, speed: 1.8, keepMin: 3.2, keepMax: 6, cooldown: 2.2, orbSpeed: 6, orbRange: 9 },
  king: { hp: BOSS_HP, radius: 1.15, speed: 1.3, touchCooldown: 1, jumpEvery: 4.5, jumpRadius: 1.8, fanEvery: 6, fanOrbs: 5 },
} as const

export const ENEMY_KNOCKBACK = 0.35
export const HIT_INVULNERABLE = 0.8
export const TICK_HZ = 20

// Netcode tolerances (server checks on what devices report).
export const MOVE_TOLERANCE = 1.5
export const HIT_RANGE_TOLERANCE = 0.8
export const MAX_VIEW_DELAY = 0.6
export const STRIKE_CLAIM_WINDOW = 1.2
