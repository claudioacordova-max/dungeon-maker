export type Anim =
  | 'idle' | 'run' | 'attack' | 'charge' | 'special' | 'hurt' | 'die'
  | 'windup' | 'throw' | 'jump' | 'land' | 'trigger'

export type Pose = {
  anim: Anim
  /** Seconds since the game entered this animation. */
  t: number
  charge: number
  flash: number
}

export function makePose(): Pose {
  return { anim: 'idle', t: 0, charge: 0, flash: 0 }
}
