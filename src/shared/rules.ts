// Balance numbers. The designer owns them (DESIGN.md "Números"); change them only on request.
export const TEAM_LIVES = 3
export const HERO_HITS = 4
export const ROOMS_TO_WIN = 5
export const MASTER_START_POINTS = 10
export const POINTS_PER_HIT = 1
export const COST = { enemy: 2, trap: 1, chest: 0 } as const
export const CHEST_HEAL = 2
export const RESPAWN_SECONDS = 1
export const FIRST_ROOM_ENEMIES = 2

// Feel and tuning values chosen by the agent (not in DESIGN.md yet).
export const MAX_HEROES = 4
export const ROOM_W = 9 // cells
export const ROOM_H = 13 // cells
export const HERO_SPEED = 4 // cells per second
export const HERO_RADIUS = 0.35
export const ATTACK_RANGE = 2.6
export const ATTACK_COOLDOWN = 0.4
export const ENEMY_HP = 3
export const ENEMY_SPEED = 1.9
export const ENEMY_REACH = 0.75
export const ENEMY_ATTACK_COOLDOWN = 1
export const HIT_INVULNERABLE = 0.8 // seconds a hero cannot be hit again
export const TICK_HZ = 20
