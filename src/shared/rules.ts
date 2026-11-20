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
export const ENEMY_TELEGRAPH = 0.5 // seconds the red zone shows before an enemy strikes

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
export const ENEMY_REACH = 1.05 // distance at which an enemy starts its wind-up
export const ENEMY_STRIKE_OFFSET = 0.55 // zone centre ahead of the enemy, towards its target
export const ENEMY_STRIKE_RADIUS = 0.8
export const ENEMY_RECOVER = 0.6 // seconds standing still after striking
export const ENEMY_ATTACK_COOLDOWN = 1.2 // seconds between strikes
export const ENEMY_HIT_STUN = 0.25 // seconds an enemy stops after being hit
export const ENEMY_KNOCKBACK = 0.35
export const HIT_INVULNERABLE = 0.8 // seconds a hero cannot be hit again
export const TICK_HZ = 20

// Netcode tolerances (server checks on what clients report).
export const MOVE_TOLERANCE = 1.5 // allowed speed factor over HERO_SPEED, for jittery packets
export const HIT_RANGE_TOLERANCE = 0.6
export const MAX_VIEW_DELAY = 0.6 // seconds the server rewinds enemies to check a hit
export const STRIKE_CLAIM_WINDOW = 1.2 // seconds after a strike in which a hero can report being hit
