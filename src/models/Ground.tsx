import { useEffect, useMemo } from 'react'
import {
  CanvasTexture, CircleGeometry, DodecahedronGeometry, ExtrudeGeometry, Float32BufferAttribute,
  MeshToonMaterial, PlaneGeometry, RepeatWrapping, Shape, SRGBColorSpace, type BufferGeometry,
} from 'three'
import { ROOM_H, ROOM_W } from '../shared/rules'
import { noise } from './chasm'
import { bake, barrel, box, gem, toon, type Part } from './kit'

type Point = [number, number]
type Brush = CanvasRenderingContext2D
const tileSize = 20
const pixelsPerUnit = 48

function painting(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w * pixelsPerUnit
  canvas.height = h * pixelsPerUnit
  const ctx = canvas.getContext('2d')!
  ctx.scale(pixelsPerUnit, pixelsPerUnit)
  return ctx
}

function polygon(ctx: Brush, points: Point[], color: string) {
  ctx.beginPath()
  ctx.moveTo(...points[0])
  for (const p of points.slice(1)) ctx.lineTo(...p)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function texture(ctx: Brush) {
  const map = new CanvasTexture(ctx.canvas)
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 4
  return map
}

// Each motif is painted across the edges of the tile. The large, sheared
// shelves and their thin split faces follow a common grain through the rock.
function paintStone() {
  const ctx = painting(tileSize, tileSize)
  ctx.fillStyle = '#453f50'
  ctx.fillRect(0, 0, tileSize, tileSize)
  function scatter(count: number, seed: number, draw: (i: number) => void) {
    for (let i = 0; i < count; i++) {
      const x = noise(i, seed) * tileSize, z = noise(i, seed + 1) * tileSize
      for (const dx of [-tileSize, 0, tileSize]) for (const dz of [-tileSize, 0, tileSize]) {
        ctx.save()
        ctx.translate(x + dx, z + dz)
        ctx.rotate(-.38 + (noise(i, seed + 2) - .5) * .82)
        draw(i)
        ctx.restore()
      }
    }
  }
  scatter(45, 18, i => {
    ctx.scale(.6 + 2.8 * noise(i, 3), .38 + 1.2 * noise(i, 9))
    const end = .62 + .32 * noise(i, 2)
    polygon(ctx, [[-1,.14],[-.58,-.46],[.23,-.63],[1,-.21],[end,.22],[-.13,.49],[-.83,.36]],
      ['#403a4c','#484152','#423c4e','#494352'][i % 4])
    if (i % 3 === 0) {
      polygon(ctx, [[-1,.14],[-.83,.36],[-.13,.49],[end,.22],[.18,.52],[-.55,.49]], '#373342')
    }
  })
  scatter(19, 80, i => {
    if (i % 4 === 1) ctx.rotate(1.24)
    ctx.scale(.53 + 1.03 * noise(i, 81), .65 + .5 * noise(i, 82))
    const bend = -.19 - .27 * noise(i, 83)
    const split: Point[] = [[-1.6,.27],[-.67,.02],[-.43,bend],[.27,bend-.03],[.48,bend-.22],[1.31,-.64]]
    polygon(ctx, [...split,[.52,bend-.14],[.34,bend+.04],[-.39,bend+.075],[-.62,.09]], '#302b39')
    polygon(ctx, [[-.65,.10],[-.39,bend+.075],[.34,bend+.04],[-.34,bend+.13]], '#5a5262')
    polygon(ctx, [[.27,bend],[.12,bend-.35],[-.31,bend-.53],[.17,bend-.39],[.35,bend]], '#363040')
    if (i % 3 !== 0) return
    // Amethyst caught in the split, with a flat light face and a buried tip.
    for (let j = 0; j < 3; j++) {
      ctx.save()
      ctx.translate(-.30 + j * .24, bend + .015 * j)
      ctx.rotate(-.45 + j * .41)
      ctx.scale(.12 + .06 * noise(i,j), .20 + .14 * noise(j,i))
      polygon(ctx, [[-.56,0],[-.44,-.65],[0,-1.12],[.47,-.61],[.51,.18],[.04,.37]], '#796187')
      polygon(ctx, [[0,-1.12],[.47,-.61],[.51,.18],[.04,.37],[.06,-.59]], '#584761')
      polygon(ctx, [[-.44,-.65],[0,-1.12],[.06,-.59],[-.22,-.40]], '#b29cba')
      ctx.restore()
    }
  })
  scatter(160, 44, i => {
    ctx.scale(.05 + .18 * noise(i,45), .04 + .12 * noise(i,46))
    polygon(ctx, [[-1,.25],[.07,-.52],[1,-.28],[.47,.31]], i % 4 ? '#514b5a' : '#322e3e')
  })
  const map = texture(ctx)
  map.wrapS = map.wrapT = RepeatWrapping
  return map
}

// The plan is an emission map. Black leaves the shale unmarked and the soft
// shoulders of the ink are filtered along with its core as the camera recedes.
function paintPlan(boss: boolean) {
  const ctx = painting(ROOM_W, ROOM_H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, ROOM_W, ROOM_H)
  ctx.translate(ROOM_W / 2, ROOM_H / 2)
  const x = ROOM_W / 2 - .62, z = ROOM_H / 2 - .62
  const grid = boss ? '#713454' : '#4e375f'
  const halo = boss ? '#912e61' : '#5e3b80'
  const ink = boss ? '#f17cab' : '#ac82ce'
  const light = boss ? '#ffb4bd' : '#d5afe7'
  function stroke(points: Point[], color: string, width: number) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(...points[0])
    for (const p of points.slice(1)) ctx.lineTo(...p)
    ctx.stroke()
  }
  function etch(points: Point[], width = .055) {
    stroke(points, halo, width * 3)
    stroke(points, ink, width)
  }
  // A scraped work surface just inside the stakes, with pick marks on its lip.
  polygon(ctx, [[-x-.14,-z+.43],[-x+.41,-z-.16],[x-.34,-z-.24],[x+.26,-z+.32],
    [x+.13,z-.31],[x-.32,z+.20],[-x+.18,z+.17],[-x-.21,z-.58]], boss ? '#301621' : '#292333')
  for (let i = 1; i < ROOM_W; i++) {
    const u = i - ROOM_W / 2
    stroke([[u,-z],[u,z]], grid, .031)
  }
  for (let i = 1; i < ROOM_H; i++) {
    const v = i - ROOM_H / 2
    stroke([[-x,v],[x,v]], grid, .031)
  }
  // Four drafted corners with a door-width break in the middle of each side.
  for (const sx of [-1,1]) for (const sz of [-1,1]) {
    ctx.save()
    ctx.scale(sx, sz)
    etch([[.89,z],[x-.40,z],[x,z-.40],[x,.89]])
    stroke([[x-1.14,z-.19],[x-.45,z-.19],[x-.19,z-.45],[x-.19,z-1.14]], light, .045)
    for (let i = 0; i < 3; i++) {
      stroke([[x-.61-i*.21,z-.19],[x-.68-i*.21,z-.29]], ink, .045)
    }
    stroke([[.89,z-.15],[.89,z+.15]], light, .07)
    stroke([[x-.15,.89],[x+.15,.89]], light, .07)
    ctx.restore()
  }
  // A survey compass for the ordinary lot. The boss claim bears the
  // Maestro's narrowed eye under a three-point crown, legible from above.
  const seal: Point[] = [[0,-1.56],[1.56,0],[0,1.56],[-1.56,0],[0,-1.56]]
  polygon(ctx, seal, boss ? '#3f162d' : '#282133')
  etch(seal, .065)
  for (let i = 0; i < 4; i++) {
    ctx.save()
    ctx.rotate(i*Math.PI/2)
    stroke([[0,-1.97],[0,-1.68]], light, .072)
    if (!boss) {
      polygon(ctx, [[0,-1.16],[.24,-.26],[0,-.07]], '#be9eda')
      polygon(ctx, [[0,-1.16],[0,-.07],[-.24,-.26]], '#73518e')
    }
    ctx.restore()
  }
  if (boss) {
    etch([[-.70,-.75],[-.44,-.53],[0,-1.03],[.44,-.53],[.70,-.75],[.53,-.29],[-.53,-.29],[-.70,-.75]])
    etch([[-.96,-.04],[-.32,.04],[0,.19],[.32,.04],[.96,-.04],[.46,.45],[0,.61],[-.46,.45],[-.96,-.04]], .08)
    polygon(ctx, [[0,.14],[.14,.31],[0,.53],[-.14,.31]], light)
  }
  return texture(ctx)
}

let shale: CanvasTexture | undefined
function groundMaterial(plan?: CanvasTexture) {
  const material = new MeshToonMaterial({
    gradientMap: toon.gradientMap, map: shale ??= paintStone(), emissiveMap: plan ?? null,
    emissive: plan ? '#ffffff' : '#000000', depthWrite: !!plan,
  })
  // World-space color UVs keep the same mineral vein running from the
  // background through any translated lot. Only its blueprint uses local UVs.
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>',
      `#include <uv_vertex>
      vMapUv = (modelMatrix * vec4(position, 1.0)).xz * vec2(1., -1.) / ${tileSize.toFixed(1)};`)
  }
  return material
}

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }
export function Bedrock({ minX, maxX, minZ, maxZ }: Bounds) {
  const ground = useMemo(() => {
    const w = maxX - minX, h = maxZ - minZ
    const g = new PlaneGeometry(w, h, Math.min(80, Math.ceil(w / 3)), Math.min(80, Math.ceil(h / 3)))
    g.rotateX(-Math.PI / 2).translate(minX + w / 2, 0, minZ + h / 2)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      p.setY(i, -.063 + .016 * Math.sin(.79*p.getX(i) + .36*p.getZ(i)) + .009 * Math.cos(.68*p.getZ(i)))
    }
    g.computeVertexNormals()
    return g
  }, [minX, maxX, minZ, maxZ])
  const material = useMemo(() => groundMaterial(), [])
  useEffect(() => () => ground.dispose(), [ground])
  useEffect(() => () => material.dispose(), [material])
  // Draw below even the recessed chasm faces from RoomShell. Keeping depth
  // writes off here lets those cliffs and their dark bottom paint over us.
  return <mesh name="Bedrock" geometry={ground} material={material} renderOrder={-100} dispose={null} />
}

function splitRock() {
  const g = new DodecahedronGeometry(.5)
  const normal = g.attributes.normal
  const colors: number[] = []
  for (let i = 0; i < normal.count; i++) {
    // Buried side faces stay dark even under the room's strong overhead light.
    const shade = .48 + .52 * Math.max(0, normal.getY(i))
    colors.push(shade, shade, shade)
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return g
}
const rock = splitRock()
const contact = new CircleGeometry(.5, 9).rotateX(-Math.PI / 2)
const lotFloor = new PlaneGeometry(ROOM_W, ROOM_H).rotateX(-Math.PI / 2).translate(0, -.022, 0)
const debrisColors = ['#685a6a','#80717d','#544b5d','#756676','#968593']

function minersPick() {
  const head = new Shape()
  head.moveTo(-.87,-.34)
  for (const [x,y] of [[-.57,.01],[-.16,.17],[.28,.14],[.71,-.04],[.82,-.23],[.35,-.11],[-.12,-.075]]) head.lineTo(x,y)
  head.closePath()
  const iron = new ExtrudeGeometry(head, { depth: .10, bevelThickness: .025, bevelSize: .025, bevelSegments: 1 })
  iron.rotateX(-Math.PI / 2)
  const shaft = (c: string, z: number, width: number, length: number): Part => ({
    g: barrel, c, p: [0,.08,z], s: [width,length,width], r: [Math.PI / 2,0,0],
  })
  return bake([
    shaft('#bd895d', .83, .14, 1.70), shaft('#654448', 1.46, .16, .39),
    shaft('#e1a864', 1.67, .17, .07), shaft('#e7b97a', .21, .17, .11),
    { g: iron, c: '#8893a2' },
    { g: box, c: '#4e4c60', p: [0,.075,.02], s: [.27,.19,.26] },
    { g: box, c: '#c39561', p: [0,.178,.02], s: [.14,.025,.13] },
  ], 0).color
}
const pick = minersPick()

function lotDebris(boss: boolean) {
  const parts: Part[] = []
  const piles: [number, number, number][] = [[-3.78,-4.56,1],[3.78,2.95,.79],[-2.56,4.78,.57],[2.67,-4.80,.41]]
  piles.forEach(([cx, cz, size], pile) => {
    for (let i = 0; i < 10; i++) {
      const a = i * 2.40 + pile, reach = size * Math.sqrt(i) * .31
      const w = size * (1.22 - i * .099), height = w * (.43 + .18 * noise(i,pile))
      const x = cx + reach * Math.cos(a), z = cz + reach * Math.sin(a)
      parts.push({ g: contact, c: '#39323f', p: [x+.04*w,-.015,z+.05*w], s: [w*1.08,1,w*.88] })
      parts.push({ g: rock, c: debrisColors[(pile+i) % debrisColors.length],
        p: [x, height * .27, z],
        s: [w, height, w * (.62 + .27 * noise(pile,i))], r: [.22, a, -.19] })
    }
  })
  parts.push({ g: pick, c: '#ffffff', p: [-3.55,.49,-4.51], r: [.41,.79,-.08] })
  for (const [x,z] of [[-4.70,5.51],[4.69,-5.51]]) {
    parts.push(
      { g: box, c: '#78503e', p: [x,.26,z], s: [.15,.56,.15], r: [0,.23,0] },
      { g: barrel, c: '#d7a66a', p: [x,.40,z], s: [.22,.08,.22] },
      { g: gem, c: boss ? '#eb648c' : '#bb8fe4', p: [x,.62,z], s: [.24,.36,.24] },
      { g: box, c: '#b7875d', p: [x+.20,.34,z], s: [.56,.075,.08] },
      { g: box, c: boss ? '#a33658' : '#75517e', p: [x+.34,.20,z], s: [.22,.26,.055] },
    )
  }
  return bake(parts, 0).color
}

// The only two variants share the same floor geometry and never rebake as
// free spots come and go during construction.
const lots = new Map<boolean, { material: MeshToonMaterial; rubble: BufferGeometry }>()
export function UnbuiltLot({ boss = false }: { boss?: boolean }) {
  let lot = lots.get(boss)
  if (!lot) {
    lot = { material: groundMaterial(paintPlan(boss)), rubble: lotDebris(boss) }
    lots.set(boss, lot)
  }
  return <group dispose={null}>
    <mesh geometry={lotFloor} material={lot.material} />
    <mesh geometry={lot.rubble} material={toon} rotation-y={boss ? Math.PI : 0} />
  </group>
}
