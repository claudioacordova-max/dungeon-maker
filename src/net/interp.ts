// Snapshot interpolation: other heroes, enemies and projectiles are drawn slightly in the past (INTERP_DELAY),
// blending the two snapshots around that moment. Smooth motion at 20 server updates per second, no re-renders.
import type { Snapshot } from '../shared/protocol'

export const INTERP_DELAY = 110 // ms: a bit more than two server ticks
const KEEP = 14

type P = { x: number; y: number }
type Frame = {
  at: number
  heroes: Map<string, P>
  enemies: Map<number, P>
  orbs: Map<number, P>
  shots: Map<number, P>
}

const frames: Frame[] = []

export function pushSnapshot(s: Snapshot) {
  frames.push({
    at: performance.now(),
    heroes: new Map(s.heroes.map((h) => [h.id, { x: h.x, y: h.y }])),
    enemies: new Map(s.enemies.map((e) => [e.id, { x: e.x, y: e.y }])),
    orbs: new Map(s.orbs.map((o) => [o.id, { x: o.x, y: o.y }])),
    shots: new Map(s.shots.map((o) => [o.id, { x: o.x, y: o.y }])),
  })
  if (frames.length > KEEP) frames.shift()
}

export function clearSnapshots() {
  frames.length = 0
}

const out: P = { x: 0, y: 0 }

// Returns a shared object (valid until the next call): copy it if you keep it.
function sample<K>(pick: (f: Frame) => Map<K, P>, id: K): P | null {
  if (frames.length === 0) return null
  const t = performance.now() - INTERP_DELAY
  for (let i = frames.length - 1; i > 0; i--) {
    const a = frames[i - 1]
    if (a.at > t) continue
    const pa = pick(a).get(id)
    const pb = pick(frames[i]).get(id)
    if (!pa || !pb) return pb ?? pa ?? null
    const k = Math.min(1, Math.max(0, (t - a.at) / (frames[i].at - a.at || 1)))
    out.x = pa.x + (pb.x - pa.x) * k
    out.y = pa.y + (pb.y - pa.y) * k
    return out
  }
  return pick(frames[0]).get(id) ?? null
}

export const sampleHero = (id: string) => sample((f) => f.heroes, id)
export const sampleEnemy = (id: number) => sample((f) => f.enemies, id)
export const sampleOrb = (id: number) => sample((f) => f.orbs, id)
export const sampleShot = (id: number) => sample((f) => f.shots, id)

export function latestHero(id: string): P | null {
  return frames.length ? (frames[frames.length - 1].heroes.get(id) ?? null) : null
}

export function latestEnemy(id: number): P | null {
  return frames.length ? (frames[frames.length - 1].enemies.get(id) ?? null) : null
}
