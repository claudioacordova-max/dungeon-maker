// Snapshot interpolation: other heroes and enemies are drawn slightly in the past (INTERP_DELAY), blending the two
// snapshots around that moment. Smooth motion at the server's 20 updates per second, without React re-renders.
import type { Snapshot } from '../shared/protocol'

export const INTERP_DELAY = 110 // ms: a bit more than two server ticks
const KEEP = 12

type Frame = { at: number; heroes: Map<string, { x: number; y: number }>; enemies: Map<number, { x: number; y: number }> }

const frames: Frame[] = []

export function pushSnapshot(s: Snapshot) {
  frames.push({
    at: performance.now(),
    heroes: new Map(s.heroes.map((h) => [h.id, { x: h.x, y: h.y }])),
    enemies: new Map(s.enemies.map((e) => [e.id, { x: e.x, y: e.y }])),
  })
  if (frames.length > KEEP) frames.shift()
}

export function clearSnapshots() {
  frames.length = 0
}

function sample<K>(pick: (f: Frame) => Map<K, { x: number; y: number }>, id: K): { x: number; y: number } | null {
  if (frames.length === 0) return null
  const t = performance.now() - INTERP_DELAY
  for (let i = frames.length - 1; i > 0; i--) {
    const a = frames[i - 1]
    const b = frames[i]
    if (a.at <= t) {
      const pa = pick(a).get(id)
      const pb = pick(b).get(id)
      if (!pa || !pb) return pb ?? pa ?? null
      const k = Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at || 1)))
      return { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k }
    }
  }
  return pick(frames[0]).get(id) ?? null
}

export const sampleHero = (id: string) => sample((f) => f.heroes, id)
export const sampleEnemy = (id: number) => sample((f) => f.enemies, id)

// Latest server position of a hero (for reconciling the locally predicted hero).
export function latestHero(id: string): { x: number; y: number } | null {
  return frames.length ? (frames[frames.length - 1].heroes.get(id) ?? null) : null
}

// Latest server position of an enemy (debug ghosts).
export function latestEnemy(id: number): { x: number; y: number } | null {
  return frames.length ? (frames[frames.length - 1].enemies.get(id) ?? null) : null
}
