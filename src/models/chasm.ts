import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import type { Gap } from '../shared/layouts'
import type { V3 } from './kit'

// Work in the layout's east/north coordinates until emitting vertices.
export function remainingFloor(rect: Gap, cuts: readonly Gap[]): Gap[] {
  let pieces = [rect]
  for (const cut of cuts) {
    const next: Gap[] = []
    for (const piece of pieces) {
      const [l, b, r, t] = piece
      const x0 = Math.max(l, cut[0]), y0 = Math.max(b, cut[1])
      const x1 = Math.min(r, cut[2]), y1 = Math.min(t, cut[3])
      if (x0 >= x1 || y0 >= y1) { next.push(piece); continue }
      if (b < y0) next.push([l, b, r, y0])
      if (y1 < t) next.push([l, y1, r, t])
      if (l < x0) next.push([l, y0, x0, y1])
      if (x1 < r) next.push([x1, y0, r, y1])
    }
    pieces = next
  }
  return pieces
}

export function noise(x: number, y: number) {
  const n = Math.imul(x + 73, 2246822519) ^ Math.imul(y + 37, 3266489917)
  return (Math.imul(n ^ (n >>> 16), 1597334677) >>> 0) / 4294967296
}

const lipWidth = .18
export function cutForLip([l, b, r, t]: Gap, w: number, h: number): Gap {
  return [Math.max(0, l - lipWidth), Math.max(0, b - lipWidth),
    Math.min(w, r + lipWidth), Math.min(h, t + lipWidth)]
}

type Point = [number, number]
function corners([l, b, r, t]: Gap): Point[] { return [[l, b], [r, b], [r, t], [l, t]] }
const lipStone = ['#dfbd99', '#cbb399', '#ead1b0', '#d7bca7']
const splitStone = ['#a48579', '#876d70', '#957d79', '#b39a87']
const darkRock = ['#4e414f', '#685463', '#554858', '#5f5061']
const deep = '#130e20'

export function chasm(gap: Gap, cut: Gap, w: number, h: number) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = []
  const paint = new Color()
  const [l, b, r, t] = gap
  function vertex([x, y, z]: V3, color: string) {
    // Batter the buried wall foundations inward. At the tilted camera angle
    // the darkness then stays inside the silhouette of the standing wall.
    const u = (x - l) / (r - l), v = (-z - b) / (t - b)
    const sink = Math.max(0, -y - .07) * 1.1
    const sx = Math.min(sink, (r - l) * .48), sy = Math.min(sink, (t - b) * .48)
    const east = (l === 0 ? 1 - u : 0) - (r === w ? u : 0)
    const north = (b === 0 ? 1 - v : 0) - (t === h ? v : 0)
    positions.push(x + sx * east, y, z - sy * north)
    paint.set(color)
    colors.push(paint.r, paint.g, paint.b)
  }
  function face(a: V3, b: V3, c: V3, d: V3, top: string, bottom = top) {
    const i = positions.length / 3
    vertex(a, top); vertex(b, top); vertex(c, bottom); vertex(d, bottom)
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }

  const inner = corners(gap), outer = corners(cut)
  const wall = [b === 0, r === w, t === h, l === 0]
  // Untextured darkness closes the well behind the cliffs, well below the tiles.
  const depth = -2.4
  face([l,depth,-b], [r,depth,-b], [r,depth,-t], [l,depth,-t], deep)
  for (let side = 0; side < 4; side++) {
    const next = (side + 1) % 4
    const [x, y] = inner[side], dx = inner[next][0] - x, dy = inner[next][1] - y
    const length = Math.hypot(dx, dy), nx = -dy / length, ny = dx / length
    const spans = Math.max(1, Math.ceil(length / .52))
    const backing = wall[side]
    const seed = Math.round(x * 23 + y * 47) + side * 89
    function section(i: number) {
      const u = i / spans, end = i === 0 || i === spans
      // Neighboring sides share these exact corner heights after battering.
      const variation = end ? .5 : noise(i, seed)
      const along = u + (end ? 0 : (variation - .5) * .45 / spans)
      const point = (inset: number, height: number): V3 =>
        [x + dx * along + nx * inset, height, -(y + dy * along + ny * inset)]
      return {
        apron: [outer[side][0] * (1 - along) + outer[next][0] * along, -.012,
          -(outer[side][1] * (1 - along) + outer[next][1] * along)] as V3,
        rim: point(end || backing ? 0 : -.125 * variation, -.012 - (end || backing ? 0 : .055 * variation)),
        split: point(end ? 0 : .035 + .042 * variation, -.18 - .15 * variation),
        rock: point(end ? 0 : .035 + .115 * noise(i, seed + 7), -.64 - .48 * variation),
        toe: point(0, depth),
      }
    }
    let a = section(0)
    for (let i = 1; i <= spans; i++) {
      const c = section(i), shade = Math.floor(noise(i, seed + 18) * 4)
      if (!backing) {
        face(a.apron, c.apron, c.rim, a.rim, lipStone[shade])
        // A tapered fracture runs back from an occasional split into the flagstone.
        if (i > 1 && i < spans && noise(i, seed + 45) < .24) {
          const kink = (noise(i, seed + 36) - .5) * .21
          const reach = .28 + noise(i, seed + 81) * .21
          const crack = (distance: number, sideways: number): V3 =>
            [a.rim[0] - nx * distance + dx / length * sideways, .005,
              a.rim[2] + ny * distance - dy / length * sideways]
          face(crack(0, 0), crack(.16, kink), crack(.17, kink + .028), crack(0, .042), '#736573')
          face(crack(.16, kink), crack(reach, -kink), crack(reach, .006 - kink), crack(.17, kink + .028), '#736573')
        }
      }
      face(a.rim, c.rim, c.split, a.split, backing ? '#66555c' : splitStone[shade])
      face(a.split, c.split, c.rock, a.rock, darkRock[shade], '#362b42')
      face(a.rock, c.rock, c.toe, a.toe, '#302639', deep)
      a = c
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
