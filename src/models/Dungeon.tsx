import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
  Shape, TorusGeometry,
} from 'three'
import { bake, barrel, Batch, box, cone, gem, toon, type Part, type V3 } from './kit'
import type { Pose } from './types'

export type Door = 'none' | 'closed' | 'open' | 'locked'
type Doors = Record<'n' | 'e' | 's' | 'w', Door>
const compass = ['n', 'e', 's', 'w'] as const
const yaw = [0, -Math.PI / 2, Math.PI, Math.PI / 2]

const iron = '#39384b'
const brass = '#d99b4e'
const gilt = '#ffcf70'
const enamel = '#236a70'
const amber = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
const stone = ['#ae7f6e', '#bb8d77', '#c1977e', '#aa7b70', '#b78774', '#c09985']
const caps = ['#d6aa8a', '#dfb797', '#cf9e82', '#dab192']
const flagstones = ['#bfae99', '#bcab99', '#c3b19d', '#bcab96', '#c6b49e', '#c1b09e', '#bdad9c']

// Flat bevels around the capstones catch the key light, even from directly above.
function capstone() {
  const perimeter = [[-.45,-.5],[.45,-.5],[.5,-.42],[.5,.42],[.45,.5],[-.45,.5],[-.5,.42],[-.5,-.42]]
  const v: number[] = [], faces: number[] = []
  for (const [y, width] of [[-.5,.97],[-.34,1],[.30,1],[.5,.965]]) {
    for (const [x,z] of perimeter) v.push(x * width, y, z * width)
  }
  for (let j = 0; j < 3; j++) for (let i = 0; i < 8; i++) {
    const a = j * 8 + i, b = j * 8 + (i + 1) % 8
    faces.push(a, a + 8, b, b, a + 8, b + 8)
  }
  for (let i = 1; i < 7; i++) faces.push(0, i, i + 1, 24, 25 + i, 24 + i)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(v, 3))
  g.setIndex(faces)
  const facets = g.toNonIndexed()
  facets.computeVertexNormals()
  return facets
}
const bevelBlock = capstone()

// Coordinate noise keeps the same chips, stones and vines when a gate changes.
function noise(x: number, y: number) {
  const n = Math.imul(x + 73, 2246822519) ^ Math.imul(y + 37, 3266489917)
  return (Math.imul(n ^ (n >>> 16), 1597334677) >>> 0) / 4294967296
}

function part(g: BufferGeometry, c: string, p: V3, s: V3, r?: V3): Part {
  return { g, c, p, s, r }
}

// A clipped octagonal face gives each flagstone four small chipped corners.
const tile = new BufferGeometry()
tile.setAttribute('position', new Float32BufferAttribute([
  -.46, 0, -.5, -.5, 0, -.46, -.5, 0, .46, -.46, 0, .5,
   .46, 0, .5, .5, 0, .46, .5, 0, -.46, .46, 0, -.5,
], 3))
tile.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 7])
tile.computeVertexNormals()

// Smoothly varying depth along the banner makes three broad facets of folded cloth.
const pennant = new BufferGeometry()
pennant.setAttribute('position', new Float32BufferAttribute([
  -.5, .5, 0, -.5, -.24, .035, -.16, .5, .07, -.16, -.4, .1,
   .16, .5, -.045, .16, -.55, -.02, .5, .5, 0, .5, -.18, .04,
], 3))
pennant.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 4, 5, 7, 4, 7, 6])
pennant.computeVertexNormals()

function addFloor(parts: Part[], w: number, h: number) {
  parts.push(part(box, '#938278', [w / 2, -.11, -h / 2], [w, .18, h]))
  for (let j = 0; j < Math.ceil(h); j++) {
    for (let i = 0; i < Math.ceil(w); i++) {
      const dx = Math.min(1, w - i), dz = Math.min(1, h - j)
      const pick = noise(i, j)
      const x = i + dx / 2, z = -(j + dz / 2)
      parts.push(part(tile, flagstones[Math.floor(pick * flagstones.length)], [x, 0, z], [dx * .985, 1, dz * .985]))
      if (pick < .08 && dx > .8 && dz > .8) {
        parts.push(part(box, '#a99a89', [x + .32, .0006, z - .24], [.21, .001, .014], [0, -.55, 0]))
        parts.push(part(box, '#a99a89', [x + .22, .0006, z - .27], [.09, .001, .014], [0, .38, 0]))
      }
    }
  }
  // A quiet inlaid corner in each quadrant frames the playable space.
  if (w < 4 || h < 4) return
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx === 1 ? .31 : w - .31
    const z = sz === 1 ? -h + .31 : -.31
    parts.push(part(box, '#a79178', [x + sx * .41, .0014, z], [.79, .001, .055]))
    parts.push(part(box, '#a79178', [x, .0014, z + sz * .41], [.055, .001, .79]))
    parts.push(part(box, '#99846f', [x, .0018, z], [.19, .001, .19], [0, Math.PI / 4, 0]))
    parts.push(part(box, '#d6bc92', [x, .0028, z], [.12, .001, .12], [0, Math.PI / 4, 0]))
  }
}

function addTorch(parts: Part[], fire: Part[], x: number) {
  parts.push(part(box, iron, [x, .73, .015], [.21, .38, .08]))
  parts.push(part(box, '#7c564d', [x, .75, .13], [.09, .11, .26]))
  parts.push(part(gem, iron, [x, .77, .23], [.3, .38, .3]))
  parts.push(part(barrel, brass, [x, .884, .23], [.31, .09, .31]))
  fire.push(part(gem, '#ff943c', [x, 1.075, .23], [.28, .48, .26], [0, .18, -.13]))
  fire.push(part(gem, '#ffe889', [x - .035, 1.03, .292], [.18, .3, .18], [0, 0, .16]))
  fire.push(part(gem, '#ffb643', [x + .067, 1.19, .22], [.11, .23, .1], [0, 0, -.42]))
}

function addBanner(parts: Part[], x: number, purple: boolean) {
  const cloth = purple ? '#903f65' : enamel
  parts.push(part(pennant, cloth, [x, .665, .055], [.72, .63, .8]))
  parts.push(part(box, iron, [x, .99, .07], [.91, .057, .075]))
  parts.push(part(gem, brass, [x - .46, .99, .07], [.107, .107, .107]))
  parts.push(part(gem, brass, [x + .46, .99, .07], [.107, .107, .107]))
  parts.push(part(box, gilt, [x, .69, .15], [.154, .154, .025], [0, 0, Math.PI / 4]))
  parts.push(part(box, cloth, [x, .69, .166], [.078, .078, .012], [0, 0, Math.PI / 4]))
  parts.push(part(box, brass, [x, .52, .144], [.04, .09, .018]))
}

function addIvy(parts: Part[], x: number, flip: number) {
  const green = ['#347260', '#6a9662', '#427e62']
  for (let i = 0; i < 7; i++) {
    const xx = x + flip * (i < 3 ? .11 * i : .22 + .035 * (i - 3))
    const y = i < 3 ? 1.055 : 1.02 - .137 * (i - 3)
    const z = i < 3 ? -.23 + i * .11 : .063
    const a = i % 2 === 0 ? .65 : -.65
    parts.push(part(gem, green[i % 3], [xx, y, z], [.15, .24, .12], [0, 0, a]))
  }
}

function addPier(parts: Part[], x: number, low: boolean, width: number) {
  const height = low ? .53 : 1.16
  parts.push(part(box, '#a07165', [x, height / 2 - .07, -.24], [width - .045, height - .09, .49]))
  parts.push(part(box, '#d2a288', [x, .087, -.24], [width, .174, .52]))
  parts.push(part(box, '#866058', [x, height - .14, -.24], [width, .075, .52]))
  parts.push(part(bevelBlock, '#e6bb98', [x, height - .056, -.24], [width, .112, .54]))
}

// All pieces on a side use local +z facing the room and share a single final batch.
function addWall(length: number, side: number, passage: boolean, parts: Part[], fire: Part[]) {
  const low = side === 2
  const half = length / 2 + (side % 2 === 0 ? .48 : 0)
  const spans = passage ? [[-half, -1], [1, half]] : [[-half, half]]
  const capY = low ? .33 : .96
  for (const [a, b] of spans) {
    const span = b - a
    if (span <= 0) continue
    const mid = (a + b) / 2
    parts.push(part(box, '#825d58', [mid, capY / 2 - .055, -.24], [span, capY + .11, .44]))
    parts.push(part(box, '#99695e', [mid, .068, -.24], [span, .136, .49]))
    const rows = low ? 1 : 2
    const rowH = (capY - .155) / rows
    for (let row = 0; row < rows; row++) {
      let start = a
      const count = Math.max(1, Math.round(span / .99))
      const step = span / count
      for (let i = 0; start < b - .011; i++) {
        const end = Math.min(b, start + (row === 1 && i === 0 ? step * .56 : step))
        const random = noise(i + side * 19 + (a > 0 ? 51 : 0), row + Math.floor(length))
        const c = stone[Math.floor(random * stone.length)]
        parts.push(part(box, c, [(start + end) / 2, .135 + (row + .5) * rowH, -.24], [end - start - .016, rowH - .013, .47 + .012 * random]))
        start = end
      }
    }
    const count = Math.max(1, Math.round(span / 1.25))
    for (let i = 0; i < count; i++) {
      const c = caps[Math.floor(noise(i + side * 3, 91) * caps.length)]
      parts.push(part(bevelBlock, c, [a + (i + .5) * span / count, capY, -.24], [span / count - .014, .145, .52]))
    }
  }
  if (side % 2 === 0) {
    addPier(parts, -half + .235, low, .47)
    addPier(parts, half - .235, low, .47)
  }
  if (passage && half >= 1.48) {
    for (const sign of [-1, 1]) {
      const x = sign * 1.22
      addPier(parts, x, low, .44)
      parts.push(part(box, brass, [x, low ? .28 : .89, .023], [.20, .055, .032]))
      parts.push(part(box, enamel, [x, low ? .54 : 1.17, -.24], [.20, .026, .20], [0, 0, 0]))
    }
    parts.push(part(box, '#b49c83', [0, -.055, -.24], [2, .104, .48]))
  }
  if (low || length < 3) return
  const offset = passage ? (length / 2 + 1) / 2 : length * .27
  if (side === 0) {
    if (length >= 4.8) {
      addTorch(parts, fire, -offset)
      addTorch(parts, fire, offset)
    }
    if (!passage) addBanner(parts, 0, false)
    else if (length >= 6.8) {
      addBanner(parts, -length / 2 + .59, true)
      addBanner(parts, length / 2 - .59, false)
    }
  } else {
    if (length >= 4.5) {
      addBanner(parts, -offset, side === 1)
      addTorch(parts, fire, offset)
    }
    if (length >= 3.4) addIvy(parts, length / 2 - .61, 1)
  }
}

function wallOrigin(side: number, w: number, h: number): V3 {
  if (side === 0) return [w / 2, 0, -h]
  if (side === 1) return [w, 0, -h / 2]
  if (side === 2) return [w / 2, 0, 0]
  return [0, 0, -h / 2]
}

function placeWall(parts: Part[], side: number, w: number, h: number) {
  const [ox, , oz] = wallOrigin(side, w, h)
  const a = yaw[side], sin = Math.round(Math.sin(a)), cos = Math.round(Math.cos(a))
  for (const piece of parts) {
    const [x, y, z] = piece.p!
    piece.p = [ox + cos * x + sin * z, y, oz - sin * x + cos * z]
    // Wall pieces only use local yaw and roll, which compose directly with this yaw.
    piece.r = [0, a + (piece.r?.[1] ?? 0), piece.r?.[2] ?? 0]
  }
}

function makeRoom(w: number, h: number, openings: number) {
  const solids: Part[] = [], flames: Part[] = []
  addFloor(solids, w, h)
  if (w >= 5 && h >= 5) {
    const bx = noise(w, h) > .5 ? .36 : w - .36, bz = -h + .34
    solids.push(
      part(barrel, '#9e643f', [bx, .25, bz], [.52, .50, .52]),
      part(barrel, '#c4834b', [bx, .24, bz], [.552, .27, .552]),
      part(barrel, '#564653', [bx, .12, bz], [.56, .055, .56]),
      part(barrel, '#564653', [bx, .36, bz], [.56, .055, .56]),
      part(barrel, '#e1a064', [bx, .499, bz], [.47, .027, .47]),
      part(box, '#ac744c', [bx, .515, bz], [.34, .009, .021], [0, .46, 0]),
    )
    const x = w - .33, z = -.60
    solids.push(part(box, '#decda8', [x, .048, z], [.085, .066, .31], [0, .58, 0]))
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      solids.push(part(gem, '#f3e0b8', [x + .047 * side + .089 * end, .063, z + .131 * end], [.12,.10,.12]))
    }
  }
  for (let side = 0; side < 4; side++) {
    const walls: Part[] = [], fire: Part[] = []
    addWall(side % 2 === 0 ? w : h, side, !!(openings & (1 << side)), walls, fire)
    placeWall(walls, side, w, h)
    placeWall(fire, side, w, h)
    solids.push(...walls)
    flames.push(...fire)
  }
  return { shell: bake(solids, 0).color, flames: flames.length ? bake(flames, 0).color : null }
}

function gatePieces() {
  const pieces: Part[] = []
  for (let i = -3; i <= 3; i++) {
    const x = i * .295
    pieces.push(part(box, iron, [x, .54, -.24], [.089, .85, .10]))
    pieces.push(part(gem, '#555366', [x, .15, -.24], [.132, .28, .13]))
    pieces.push(part(box, '#676376', [x - .024, .57, -.183], [.023, .7, .012]))
  }
  for (const y of [.41, .88]) {
    pieces.push(part(box, '#4e4557', [0, y, -.24], [2, .116, .15]))
    for (let i = -3; i <= 3; i += 2) {
      pieces.push(part(gem, brass, [i * .295, y, -.157], [.071, .071, .051]))
    }
  }
  return pieces
}

const bars = gatePieces()
const gate = bake(bars, 0).color
const shackle = new TorusGeometry(.5, .102, 5, 10, Math.PI)
const lockedGate = bake([
  ...bars,
  part(shackle, gilt, [0, .67, -.111], [.31, .33, .36]),
  part(box, '#ab413e', [0, .52, -.10], [.42, .3, .24]),
  part(box, '#ff6550', [0, .533, .025], [.34, .235, .027]),
  part(gem, '#642f3c', [0, .547, .047], [.090, .115, .022]),
  part(box, '#642f3c', [0, .496, .045], [.038, .069, .017]),
], 0).color
const lockLight = bake([
  part(gem, '#ff543c', [-.264, .53, -.098], [.077, .10, .072]),
  part(gem, '#ff543c', [.264, .53, -.098], [.077, .10, .072]),
  part(box, '#ff7156', [0, .88, -.24], [.39, .136, .166]),
], 0).color

const emptyRoom = new BufferGeometry()
const rooms = new Map<string, { shape: ReturnType<typeof makeRoom>; users: number }>()

export function RoomShell({ w, h, doors }: { w: number; h: number; doors: Doors }) {
  const shell = useRef<Mesh>(null), fire = useRef<Mesh>(null)
  const mask = compass.reduce((bits, key, i) => bits | (doors[key] === 'none' ? 0 : 1 << i), 0)
  // Rooms with identical masonry share their GPU buffers. A change from locked
  // to open only swaps a gate. The final owner releases both merged geometries.
  useLayoutEffect(() => {
    const key = [w, h, mask].join('/')
    let entry = rooms.get(key)
    if (!entry) {
      entry = { shape: makeRoom(w, h, mask), users: 0 }
      rooms.set(key, entry)
    }
    entry.users++
    shell.current!.geometry = entry.shape.shell
    fire.current!.geometry = entry.shape.flames ?? emptyRoom
    fire.current!.visible = !!entry.shape.flames
    return () => {
      if (--entry.users > 0) return
      rooms.delete(key)
      entry.shape.shell.dispose()
      entry.shape.flames?.dispose()
    }
  }, [w, h, mask])
  return <group dispose={null}>
    <mesh ref={shell} geometry={emptyRoom} material={toon} />
    <mesh ref={fire} geometry={emptyRoom} material={amber} />
    {compass.map((key, side) => {
      const state = doors[key]
      if (state !== 'locked' && state !== 'closed') return null
      return <group key={key} position={wallOrigin(side, w, h)} rotation-y={yaw[side]}>
        <mesh geometry={state === 'locked' ? lockedGate : gate} material={toon} />
        {state === 'locked' && <mesh geometry={lockLight} material={amber} />}
      </group>
    })}
  </group>
}

// The stave lid is a half barrel with a flat underside. Both wood and bands turn
// around the same hinge, so opening it reveals the lining and little coin pile.
function chestArch() {
  const outline = new Shape()
  outline.moveTo(-.5, 0)
  for (let i = 1; i <= 6; i++) {
    const a = Math.PI - i * Math.PI / 6
    outline.lineTo(.5 * Math.cos(a), Math.sin(a))
  }
  outline.closePath()
  const geometry = new ExtrudeGeometry(outline, { depth: 1, bevelEnabled: false })
  geometry.translate(0, 0, -.5)
  geometry.rotateY(Math.PI / 2)
  return geometry
}

const arch = chestArch()
const chestBase = bake([
  part(box, '#502e3b', [0, .06, 0], [.86, .12, .59]),
  part(box, '#b6683e', [0, .21, 0], [.81, .27, .55]),
  part(box, '#834934', [0, .21, .277], [.81, .022, .01]),
  part(box, '#f3a94e', [0, .101, 0], [.83, .052, .575]),
  part(box, '#4c3140', [0, .357, 0], [.835, .057, .575]),
  part(box, '#6c423e', [0, .379, 0], [.746, .017, .475]),
  ...[-.286, .286].map(x => part(box, brass, [x, .231, 0], [.091, .253, .57])),
  ...[-.22, .105, .201].map((x, i) => part(barrel, gilt, [x, .394, (i - 1) * .089], [.16, .027, .16])),
  part(gem, '#55c2aa', [.012, .406, -.01], [.13, .079, .13]),
], 0)

const chestLid = bake([
  part(arch, '#ab603c', [0, 0, .294], [.868, .235, .608]),
  part(box, '#82462f', [0, .028, .293], [.877, .052, .61]),
  ...[-.286, .286].map(x => part(arch, '#efb65e', [x, .004, .294], [.102, .244, .625])),
  part(box, '#684039', [0, -.009, .294], [.805, .022, .54]),
  part(box, gilt, [0, .071, .597], [.149, .192, .068]),
  part(gem, '#714047', [0, .075, .635], [.054, .075, .019]),
], 0)

export function Chest({ opened }: { opened: boolean }) {
  return <group dispose={null} rotation-y={Math.PI}>
    <Batch shape={chestBase} />
    <group position={[0, .383, -.294]} rotation-x={opened ? -1.93 : 0}>
      <Batch shape={chestLid} />
    </group>
  </group>
}

const trapSockets: [number, number][] = [[0, 0], [-.228, -.228], [.228, -.228], [-.228, .228], [.228, .228]]
const trapBase = bake([
  part(barrel, iron, [0, .045, 0], [.98, .09, .98], [0, Math.PI / 8, 0]),
  part(barrel, '#a36953', [0, .095, 0], [.88, .06, .88], [0, Math.PI / 8, 0]),
  part(barrel, '#59566a', [0, .13, 0], [.775, .032, .775], [0, Math.PI / 8, 0]),
  ...trapSockets.map(([x, z]) => part(barrel, '#313343', [x, .15, z], [.209, .018, .209])),
  ...[-1, 1].map(sign => part(box, '#ffa467', [sign * .384, .131, 0], [.027, .013, .088])),
], 0)

const spikes = bake(trapSockets.map(([x, z], i) =>
  part(cone, i === 0 ? '#fff1cb' : '#d1e0da', [x, i === 0 ? .315 : .24, z],
    [i === 0 ? .205 : .159, i === 0 ? .63 : .48, i === 0 ? .205 : .159]),
), 0)

export function SpikeTrap({ pose }: { pose: Pose }) {
  const head = useRef<Group>(null)
  useFrame(() => {
    if (!head.current) return
    const t = pose.t
    let stroke = 0
    if (pose.anim === 'trigger' && t >= 0 && t < .31) {
      if (t < .065) stroke = 1 - (1 - t / .065) ** 2
      else if (t < .125) stroke = 1
      else stroke = (1 - (t - .125) / .185) ** 2
    }
    head.current.scale.y = .13 + .87 * stroke
  })
  return <group dispose={null}>
    <Batch shape={trapBase} />
    <group ref={head} position-y={.156} scale-y={.13}>
      <Batch shape={spikes} />
    </group>
  </group>
}
