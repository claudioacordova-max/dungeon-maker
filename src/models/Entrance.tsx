import {
  BufferGeometry, CircleGeometry, Color, CylinderGeometry, DodecahedronGeometry,
  ExtrudeGeometry, Float32BufferAttribute, MeshBasicMaterial, Shape, Vector3,
} from 'three'
import { noise } from './chasm'
import { bake, barrel, Batch, box, gem, toon, type Part, type V3 } from './kit'

type Point = [number, number]
const gateX = 5.5
const tau = Math.PI * 2
const ivory = '#fff1cc'
const brass = '#db8935'
const gold = '#ffca4b'
const rock = new DodecahedronGeometry(.5)
const disc = new CircleGeometry(.5, 9).rotateX(-Math.PI / 2)
const trunk = new CylinderGeometry(.38, .5, 1, 7, 1)
const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })

function part(g: BufferGeometry, c: string, p: V3, s: V3, r?: V3): Part {
  return { g, c, p, s, r }
}

function geometry(vertices: number[], indices: number[], colors?: number[]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  g.setIndex(indices)
  if (colors) g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

function pathX(z: number) {
  return gateX + .70 * Math.sin(z * .58) - .30 * Math.sin(z * .93)
}

// Grass, the cut bank and the worn center share edges, even at grazing angles.
// The last few rows dissolve the track into the shaded grass under the trees.
function meadow() {
  const vertices: number[] = [], indices: number[] = [], colors: number[] = []
  const rim = new Color('#443e50')
  const deepGrass = new Color('#55784b')
  const rows = 25
  for (let j = 0; j <= rows; j++) {
    const z = j * 18 / rows, cx = pathX(z)
    const width = 1.05 + .23 * Math.sin(z * .39) ** 2 + .13 * noise(j, 28)
    const west = -9.8 + .65 * Math.cos(z * 1.28), east = 20.9 + .56 * Math.sin(z)
    const columns: [number, string][] = [
      [west, '#443e50'], [west + .85, '#414a45'], [-6.5, '#466548'], [-3.1, '#537e4d'],
      [-.2, '#80a954'], [(cx - width) / 2, '#a2c95f'], [cx - width - .13, '#a4c862'],
      [cx - width, '#81964b'], [cx - width + .065, '#ab8051'], [cx - width + .26, '#d1a16b'],
      [cx, '#dfb379'], [cx + width - .22, '#d6a771'], [cx + width - .065, '#b08b52'],
      [cx + width, '#8eab51'], [cx + width + .14, '#a9ca61'],
      [(cx + width + 11) / 2, '#a0c25b'], [11.4, '#7ea851'], [14.3, '#527e4e'],
      [17.6, '#46684a'], [east - .95, '#414c46'], [east, '#443e50'],
    ]
    columns.forEach(([x, hex], i) => {
      const outer = Math.max(0, Math.abs(x - gateX) - 5.7)
      const edge = .48 * Math.sin(x * 1.45) + .28 * Math.sin(x * 3.6)
      const zz = z + (j / rows) ** 6 * edge + Math.max(0, 1 - z / 2) * Math.min(1, outer) * (.85 + edge)
      const color = new Color(hex)
      const undergrowth = Math.min(1, Math.max(0, (z - 10) / 5))
      color.lerp(deepGrass, undergrowth * Math.max(0, 1 - outer / 8))
      const fade = Math.max((z - 15.4) / 2.6, (1 - z / 1.6) * Math.min(1, outer / 2))
      color.multiplyScalar(.92 + .12 * noise(i, j + 90)).lerp(rim, Math.min(1, Math.max(0, fade)))
      vertices.push(x, 0, zz)
      colors.push(color.r, color.g, color.b)
      if (j && i) {
        const d = vertices.length / 3 - 1, a = d - columns.length - 1
        indices.push(a, d - 1, a + 1, a + 1, d - 1, d)
      }
    })
  }
  return geometry(vertices, indices, colors)
}

// A five-petalled cup with a raised gold center. Each petal has a folded tip.
function wildflower() {
  const v = [0, .32, 0], indices: number[] = [], colors = [1, .53, .06]
  for (let i = 0; i < 5; i++) {
    const angle = i * tau / 5
    for (const [radius, offset, y] of [[.17, -.62, .13], [.48, -.40, .27], [.54, .15, .37], [.36, .49, .26]]) {
      v.push(radius * Math.cos(angle + offset), y, radius * Math.sin(angle + offset))
      colors.push(1, 1, 1)
    }
    const k = 1 + i * 4, next = 1 + ((i + 1) % 5) * 4
    indices.push(k, k + 2, k + 1, k, k + 3, k + 2, k, next, k + 3, 0, next, k)
  }
  return geometry(v, indices, colors)
}

const flower = wildflower()
const grass = geometry([
  -.47,0,.1, -.23,0,.14, -.51,.62,-.11, -.18,0,.12, .09,0,.18, -.05,.96,-.22,
  .03,0,.1, .29,0,.15, .46,.58,-.17,
], [0,1,2, 3,4,5, 6,7,8])

function meadowDetails() {
  const parts: Part[] = [{ g: meadow(), c: '#ffffff' }]
  for (let i = 0; i < 91; i++) {
    const z = .95 + noise(i, 13) * 11.4, x = -.55 + noise(i, 72) * 12.25
    if (Math.abs(x - pathX(z)) < 1.47) continue
    const size = .15 + noise(i, 6) * .15
    parts.push(part(grass, i % 3 ? '#77a44a' : '#c3d674', [x,.012,z], [size,.09 + .045 * noise(i,21),size], [0,noise(i,3) - .5,0]))
  }
  for (const [x,z] of [[1.15,1.5],[3.4,2.6],[8.25,1.55],[9.7,3.5],[2.5,5.9],
    [.55,7.1],[7.7,6.9],[9.65,8.35],[3.85,9.1],[11.2,5.55],[-.4,3.9]]) {
    const tint = z > 5 && x > 5 ? '#ffcc75' : '#fff4d0'
    for (let i = 0; i < 4; i++) {
      const a = i * 2.4, reach = .24 * Math.sqrt(i), w = .17 + .14 * noise(i, Math.floor(x))
      parts.push(part(flower, tint, [x + Math.cos(a)*reach,.025,z + Math.sin(a)*reach], [w,w*.74,w], [0,a,0]))
    }
  }
  for (let i = 0; i < 47; i++) {
    const z = .2 + 10.5 * noise(i, 88), side = i % 2 ? -1 : 1
    const x = pathX(z) + side * (.24 + .81 * noise(i, 34))
    if (z < 1.4) continue
    const size = .06 + .13 * noise(i, 19)
    parts.push(part(disc, i % 4 ? '#c39767' : '#ead09a', [x,.01,z], [size,1,size*.53], [0,i,0]))
  }
  return bake(parts, 0).color
}

// Uneven belts of leaves make a broad, scalloped crown. The underside
// is cool and shaded even where the game's ambient light reaches it.
function foliage(small: boolean) {
  const v = [0, -.5, 0], colors = [.48,.61,.61], indices: number[] = []
  const sides = small ? 6 : 7
  const belts = small ? [[-.18,.47,0,.75],[.23,.42,.38,1]] :
    [[-.28,.43,0,.70],[.09,.51,.28,.94],[.37,.31,.06,1.04]]
  for (const [y, radius, turn, shade] of belts) {
    for (let i = 0; i < sides; i++) {
      const a = i * tau / sides + turn, wobble = .92 + .14 * noise(i, 7)
      v.push(Math.cos(a)*radius*wobble, y + .065*(noise(i,1)-.5), Math.sin(a)*radius*wobble)
      colors.push(shade, shade, shade * (1.06 - (y + .5)*.14))
      const k = v.length / 3 - 1, next = i === sides - 1 ? k + 1 - sides : k + 1
      if (k <= sides) indices.push(0,k,next)
      else indices.push(k-sides,k,next-sides, next-sides,k,next)
    }
  }
  const top = v.length / 3
  v.push(-.04,.50,.01)
  colors.push(1.05,1.06,.96)
  for (let i = 0; i < sides; i++) indices.push(top,top-sides+(i+1)%sides,top-sides+i)
  const facets = geometry(v, indices, colors).toNonIndexed()
  facets.computeVertexNormals()
  return facets
}

const leaves = foliage(false), shrubLeaves = foliage(true)
const greens = [
  ['#659b49','#83b750','#a2c859'], ['#488759','#65a35a','#88b75e'],
  ['#5b9146','#79ad49','#a1c754'], ['#48835d','#619962','#80b268'],
]

function tree(parts: Part[], x: number, z: number, h: number, seed: number) {
  const yaw = noise(seed, 51) * tau, dx = Math.cos(yaw), dz = Math.sin(yaw)
  const width = h * (.62 + .14 * noise(seed, 27))
  const [shade, green, sun] = greens[seed % greens.length]
  parts.push(
    part(disc, '#496e48', [x,.008,z], [width,1,width*.76]),
    part(trunk, '#724c3d', [x,h*.23,z], [h*.14,h*.46,h*.14], [0,yaw,.06]),
    part(trunk, '#946544', [x + .06*h*dx,h*.40,z + .06*h*dz], [h*.073,h*.31,h*.073], [0,-yaw,-.65]),
    part(leaves, shade, [x,h*.59,z], [width*1.06,h*.40,width], [0,yaw,0]),
    part(leaves, green, [x - dx*width*.11,h*.75,z - dz*width*.11], [width*.96,h*.51,width*.86], [0,yaw+.7,0]),
    part(shrubLeaves, sun, [x + dx*width*.32,h*.67,z + dz*width*.32], [width*.61,h*.34,width*.6], [0,yaw-.5,0]),
  )
}

function bush(parts: Part[], x: number, z: number, w: number, seed: number) {
  const [shade,green,sun] = greens[seed % greens.length]
  parts.push(
    part(shrubLeaves, shade, [x-.23*w,.30*w,z], [.81*w,.63*w,.76*w], [0,seed,0]),
    part(shrubLeaves, green, [x+.18*w,.38*w,z-.08*w], [.93*w,.8*w,.80*w], [0,seed+1,0]),
    part(shrubLeaves, sun, [x+.37*w,.23*w,z+.19*w], [.54*w,.45*w,.51*w], [0,seed+2,0]),
  )
  if (seed % 3 === 0) for (const [u,y,v] of [[-.28,.56,.18],[-.16,.53,.24],[.29,.64,.16]]) {
    parts.push(part(gem, '#ed826c', [x+u*w,y*w,z+v*w], [.14*w,.13*w,.14*w]))
  }
}

function fallenLog(parts: Part[]) {
  // Lay the trunk on a diagonal with its cut end facing the approaching party.
  const yaw = .54, x = -1.35, z = 5.35, length = 2.15
  // With XYZ Euler order the local Y axis ends up at (sin(yaw), 0, cos(yaw)).
  const rotation: V3 = [Math.PI/2,0,-yaw]
  function slice(offset: number, diameter: number, depth: number, color: string) {
    parts.push(part(barrel, color, [x+Math.sin(yaw)*offset,.31,z+Math.cos(yaw)*offset],
      [diameter,depth,diameter], rotation))
  }
  slice(0,.65,length,'#73503d')
  slice(length/2,.55,.02,'#e4b880')
  slice(length/2+.014,.36,.018,'#ad794e')
  slice(length/2+.025,.26,.015,'#e4ac70')
  parts.push(part(trunk, '#826044', [x-.15,.63,z-.22], [.18,.47,.20], [0,0,.69]))
}

function forest(side: number) {
  const parts: Part[] = []
  // No trees on the central southern sightline. Heights taper at the two
  // near corners, where the canopy projects furthest into the hero's view.
  const trees = side < 0 ? [
    [-2.1,1.65,3.65],[-4.7,3.0,4.25],[-7.3,2.1,3.4],[-7.9,6.6,4.3],[-4.3,7.7,3.7],
    [-1.85,8.55,2.85],[-6.5,11.3,3.7],[-3.8,12.4,3.2],[-7.0,15.2,3.4],[-1.1,15.3,2.6],
  ] : [
    [13.25,1.8,3.85],[16.1,2.8,4.35],[18.7,5.2,3.5],[14.1,5.85,3.6],[16.4,9.05,4.2],
    [12.9,9.5,2.95],[18.6,12.8,3.75],[14.6,13.25,3.45],[11.75,15.45,2.7],[16.9,15.9,3.0],
  ]
  trees.forEach(([x,z,h], i) => tree(parts,x,z,h,i + (side < 0 ? 2 : 13)))
  const shrubs = side < 0 ? [
    [-.87,1.5,1.12],[-2.1,4.2,1.38],[-.83,7.2,1.25],[-3.2,9.55,1.66],
    [-6.6,4.4,1.80],[-8.3,9.6,1.63],[-5.3,15,1.75],[.6,10.3,1.1],[1.75,13.8,1.4],[3,16.8,1.32],
  ] : [
    [11.95,2.15,1.22],[12.55,4.1,1.57],[11.96,7.4,1.12],[15.45,7.5,1.58],
    [18.75,8.8,1.92],[16.5,12.4,1.4],[19.2,15.4,1.36],[10.95,10.6,1.25],[9.45,14,1.48],[7.85,16.1,1.25],
  ]
  shrubs.forEach(([x,z,w], i) => bush(parts,x,z,w,i + (side < 0 ? 0 : 3)))
  for (const [x,z,w] of (side < 0 ? [[-1,3.1,.93],[-3.3,6.2,.65],[1.4,9.5,.60]] : [[12,5.3,1.16],[13.1,7.3,.70],[10.4,9.5,.65]])) {
    parts.push(part(rock,'#8c8f85',[x,w*.24,z],[w,w*.66,w*.87],[.08,x,.23]))
    parts.push(part(rock,'#adae96',[x+w*.48,w*.09,z+w*.21],[w*.46,w*.32,w*.40],[0,z,.1]))
  }
  if (side < 0) fallenLog(parts)
  return bake(parts, 0).color
}

// Extruded, chamfered silhouettes keep the crown points, brows and masonry
// readable from the high game camera as well as from directly in front.
function relief(points: Point[], depth: number, bevel = .018) {
  const shape = new Shape()
  shape.moveTo(...points[0])
  for (const p of points.slice(1)) shape.lineTo(...p)
  shape.closePath()
  return new ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1,
  })
}

function horn() {
  // Sweep hexagons perpendicular to the crook, narrowing to a single tip.
  const spine = [[0,0,.16],[.19,.11,.17],[.31,.25,.13],[.33,.40,.082],[.25,.53,.043],[.12,.61,0]]
  const vertices: number[] = [], colors: number[] = [], indices: number[] = []
  spine.forEach(([x,y,radius], i) => {
    const before = spine[Math.max(0,i-1)], after = spine[Math.min(i+1,spine.length-1)]
    const tangent = new Vector3(after[0]-before[0],after[1]-before[1],0).normalize()
    for (let j = 0; j < 6; j++) {
      const a = j*tau/6, offset = Math.cos(a)*radius
      vertices.push(x-tangent.y*offset,y+tangent.x*offset,Math.sin(a)*radius)
      const ridge = .85 + .15 * Math.sin(a) ** 2
      colors.push(ridge,(.53+.09*i)*ridge,(.30+.13*i)*ridge)
      const k = i*6+j, next = i*6+(j+1)%6
      if (i) {
        indices.push(k-6,next-6,k)
        if (radius > 0) indices.push(next-6,next,k)
      }
    }
  })
  const g = geometry(vertices,indices,colors).toNonIndexed()
  g.computeVertexNormals()
  return g
}

function gate() {
  const pieces: Part[] = [], lights: Part[] = []
  const crown = relief([[-.33,0],[.33,0],[.39,.28],[.15,.17],[0,.39],[-.15,.17],[-.39,.28]],.11)
  const eye = relief([[-.26,.115],[.235,-.025],[.16,-.10],[.035,-.124],[-.11,-.10],[-.21,-.035]],.009,.004)
  const socket = relief([[-.28,.155],[.27,-.023],[.19,-.135],[.02,-.16],[-.15,-.13],[-.25,-.04]],.04,.015)
  const flame = relief([[-.15,0],[.11,0],[.19,.14],[.17,.31],[.095,.25],[.09,.40],
    [-.01,.55],[-.03,.34],[-.09,.26],[-.15,.33],[-.20,.16]],.11,.012)
  const tusk = horn()
  const stone = ['#72508b','#875a9e','#9a6db2','#805598']
  const brick = relief([[-.50,0],[.50,0],[.47,.90],[.32,1],[-.40,.96],[-.51,.76]],.72,.032)
  for (const sign of [-1,1]) {
    const pillarX = gateX+sign*1.49
    for (const [i,offset,w,h,z] of [[0,2.28,1.16,1.19,.04],[1,3.22,1.1,1.46,-.015],
      [2,4.13,1.38,.99,.06],[3,5.02,1.11,1.18,.015]]) {
      pieces.push({ ...part(rock,['#72677d','#83758a','#786981','#877c89'][i],
        [gateX+sign*offset,h*.38,z+.46],[w*1.45,h*1.20,.83],[.05,i*.055,sign*.16]), ink: false })
      pieces.push({ ...part(rock,'#807787',[gateX+sign*(offset+.21),.15,.71],[w*.73,.48,.5],[0,i,.1]), ink: false })
    }
    pieces.push(part(box,'#49344f',[pillarX,.80,.26],[.60,1.60,.69]))
    for (let i = 0; i < 4; i++) {
      pieces.push(part(brick,stone[(i+(sign+1))%4],[pillarX,.04+i*.395,.01],
        [i === 0 ? .71 : .64,.45,.94+i%2*.045]))
    }
    pieces.push(part(box,'#c193cd',[pillarX,1.58,.34],[.71,.105,.80]))
    pieces.push(part(tusk,ivory,[gateX+sign*1.27,2.05,.43],[1.13,.94,1],[-.51,sign < 0 ? Math.PI : 0,0]))

    const x = gateX+sign*1.60
    pieces.push(part(box,'#513646',[x,1.00,.71],[.30,.42,.12]))
    pieces.push(part(box,brass,[x,1.00,.87],[.14,.13,.34],[-.26,0,0]))
    pieces.push({ ...part(trunk,'#835036',[x,1.15,1.01],[.18,.42,.19],[-.12,0,0]), ink: false })
    pieces.push({ ...part(barrel,brass,[x,1.35,1.04],[.42,.21,.36]), ink: false })
    pieces.push(part(barrel,gold,[x,1.43,1.04],[.47,.085,.40]))
    lights.push(part(flame,'#ff8133',[x,1.46,1.00],[1,.93,.89]))
    lights.push(part(flame,'#ffdf67',[x-.014,1.465,1.115],[.61,.62,.60]))
  }

  // A shallow elliptical arch rises outside the two-cell rectangular clearance.
  const arc = (a: number, outer: boolean): Point => [
    Math.cos(a) * (outer ? 1.82 : 1.21), 1.59 + Math.sin(a) * (outer ? .73 : .55),
  ]
  for (let i = 0; i < 9; i++) {
    const a = i*Math.PI/9+.025, b = (i+1)*Math.PI/9-.025
    const block = relief([arc(a,false),arc(b,false),arc(b,true),arc(a,true)],.68,.017)
    pieces.push({ g: block, c: stone[(i+1)%4], p: [gateX,0,-.04] })
  }
  // Mount the face on a forward-leaning slab so the eyes are visible from above.
  const mask = relief([[-.70,.12],[-.58,-.15],[-.24,-.18],[0,-.11],[.23,-.18],[.58,-.15],[.70,.12],[.43,.22],[-.43,.22]],.13)
  const tilt = -.63
  pieces.push(part(mask,'#754783',[gateX,2.13,.65],[1,1,1],[tilt,0,0]))
  for (const sign of [-1,1]) {
    const x = gateX + sign*.32
    // Mirror the relief around its mid-depth so the two sockets sit flush.
    const socketShape = sign < 0 ? socket : socket.clone().rotateY(Math.PI).translate(0,0,.04)
    const eyeShape = sign < 0 ? eye : eye.clone().rotateY(Math.PI).translate(0,0,.009)
    pieces.push({ ...part(socketShape,'#422842',[x,2.20,.79],[1,1,1],[tilt,0,0]), ink: false })
    lights.push(part(eyeShape,'#ff9c25',[x,2.225,.846],[1,1,1],[tilt,0,0]))
    lights.push(part(eyeShape,'#ffe84e',[x,2.24,.865],[.83,.71,1],[tilt,0,0]))
  }
  pieces.push(part(crown,gold,[gateX,2.24,.28],[1.15,.85,1],[-.78,0,0]))
  pieces.push(part(box,brass,[gateX,2.34,.35],[.72,.057,.072],[-.78,0,0]))
  pieces.push(part(gem,'#e65e4d',[gateX,2.41,.33],[.13,.14,.075],[-.78,0,0]))
  return { stone: bake(pieces,.012), light: bake(lights,0).color }
}

const lawn = meadowDetails()
const west = forest(-1), east = forest(1)
const facade = gate()

export function DungeonEntrance() {
  return <group name="Dungeon entrance" dispose={null}>
    <mesh geometry={lawn} material={toon} />
    <mesh geometry={west} material={toon} />
    <mesh geometry={east} material={toon} />
    <Batch shape={facade.stone} />
    <mesh geometry={facade.light} material={glow} />
  </group>
}
