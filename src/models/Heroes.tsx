import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, Vector3, type Group } from 'three'
import { BlobShadow } from './Effects'
import { bake, Batch, barrel, box, gem, type Part, type V3 } from './kit'
import type { Pose } from './types'

type HeroProps = { pose: Pose; tint: string }
type Point = [number, number]
type Ring = [height: number, width: number, depth: number, z?: number, x?: number]

function surface(vertices: number[]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  g.computeVertexNormals()
  return g
}

// Eight corners keep the cheeks and breastplates broad and readable under a high camera.
function shell(rings: Ring[]) {
  const corners = [[-.66, -1], [.66, -1], [1, -.59], [1, .59], [.66, 1], [-.66, 1], [-1, .59], [-1, -.59]]
  const levels = rings.map(([y, w, d, z = 0, x = 0]) => corners.map(([u, v]): V3 => [x + u * w / 2, y, z + v * d / 2]))
  const vertices: number[] = []
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8
    for (let k = 1; k < levels.length; k++) {
      const a = levels[k - 1], b = levels[k]
      vertices.push(...a[i], ...b[i], ...b[j], ...a[i], ...b[j], ...a[j])
    }
    if (i > 0 && i < 7) {
      const bottom = levels[0], top = levels[levels.length - 1]
      vertices.push(...bottom[0], ...bottom[i], ...bottom[j], ...top[0], ...top[j], ...top[i])
    }
  }
  return surface(vertices)
}

// A convex, double-sided, ridged badge, feather or plate, authored in its front elevation.
function fold(points: Point[], depth: number, ridge: Point = [0, 0]) {
  const vertices: number[] = []
  const area = points.reduce((sum, [x, y], i) => {
    const next = points[(i + 1) % points.length]
    return sum + x * next[1] - y * next[0]
  }, 0)
  const edge = area < 0 ? points : [...points].reverse()
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i], b = edge[(i + 1) % edge.length]
    vertices.push(...a, 0, ...b, 0, ...ridge, -depth)
    if (depth > 0) vertices.push(...b, 0, ...a, 0, ...ridge, depth)
  }
  return surface(vertices)
}

const beveled = shell([[-.5, .91, .90], [.18, 1, 1], [.5, .80, .80]])
const band = shell([[-.5, .92, .94], [.5, 1, 1]])
const toe = shell([[-.5, .97, .94], [.10, 1, 1], [.50, .80, .65, .05]])
const face = shell([[-.5, .54, .68], [-.27, .90, .96], [.12, 1, 1], [.5, .85, .84]])
const patch = surface([-.5, -.5, 0, -.5, .5, 0, .5, .5, 0, -.5, -.5, 0, .5, .5, 0, .5, -.5, 0])
const eye = fold([[-.50, .37], [.37, .50], [.50, .26], [.39, -.28], [.03, -.50], [-.43, -.35]], 0)
const taper = fold([[-.50, .46], [.50, .50], [.36, -.14], [-.12, -.50], [-.41, -.19]], .16)
const feather = fold([[-.21, -.50], [-.49, -.08], [-.49, .20], [.43, .50], [.50, .21], [.24, -.19]], .14, [-.02, .02])
const diamond = fold([[0, .50], [.50, 0], [0, -.50], [-.50, 0]], .15)

const brass = '#ffc45a', leather = '#623d45', eyeWhite = '#fff4d6'
const part = (g: BufferGeometry, c: string, p: V3, s: V3, r?: V3, outline = true): Part => ({ g, c, p, s, r, ink: outline })
const paint = (g: BufferGeometry, c: string, p: V3, s: V3, r?: V3): Part => part(g, c, p, s, r, false)
const team = (item: Part): Part => ({ ...item, accent: true })
const lit = (item: Part): Part => ({ ...item, glow: true })

// Tip the whole head back at the neck so the facial planes meet the high gameplay camera.
function liftVisor(parts: Part[], angle: number): Part[] {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return parts.map(item => {
    const [x, y, z] = item.p ?? [0, 0, 0]
    const [rx, ry, rz] = item.r ?? [0, 0, 0]
    return { ...item, p: [x, .61 + (y - .61) * cos - z * sin, (y - .61) * sin + z * cos], r: [rx + angle, ry, rz] }
  })
}

function eyes(y: number, z: number, fierce: number): Part[] {
  return [-1, 1].flatMap((side): Part[] => [
    paint(eye, eyeWhite, [side * .082, y, z], [.117, .088, 1], [0, 0, side * fierce]),
    paint(patch, '#302631', [side * .073, y - .002, z - .005], [.038, .060, 1]),
    paint(patch, '#fffdf1', [side * .073 - .006, y + .015, z - .008], [.014, .015, 1]),
    paint(patch, '#392d35', [side * .084, y + .043, z - .003], [.130, .031, 1], [0, 0, side * fierce]),
  ])
}

const gold = '#ffc45a', cloth = '#fff3df', cream = '#f6dba7'
const blue = '#3055b6', steel = '#a7b7d0'
const skin = '#f1ab76', chestnut = '#793e31', glove = '#784734'
const knee = fold([[-.49, .25], [-.15, .49], [.40, .37], [.50, -.10], [.22, -.45], [-.35, -.37]], .22)

function boots(ranger: boolean) {
  return bake([
    paint(box, ranger ? '#70503b' : '#584044', [0, -.055, .010], [.135, .138, .130]),
    paint(band, ranger ? '#754930' : '#694231', [0, -.143, .010], [.158, .123, .158]),
    paint(toe, ranger ? '#815131' : '#825138', [0, -.198, -.024], [.176, .100, .222]),
    paint(box, '#332d3c', [0, -.241, -.025], [.162, .032, .195]),
    ranger ? paint(box, '#f9b762', [0, -.122, -.067], [.090, .034, .023])
      : paint(knee, steel, [0, -.128, -.102], [.149, .108, .100], [.62, 0, 0]),
  ], .005)
}

const meleeBoot = boots(false), rangerBoot = boots(true)
const cheekGuard = fold([[-.45, .48], [.38, .49], [.50, .04], [.25, -.50], [-.36, -.24]], .23)
const sash = fold([[-.49, .50], [.49, .35], [.39, -.34], [.07, -.23], [-.18, -.50], [-.46, -.32]], .07)

// Bake broad color planes so that ridges read even within one band of toon lighting.
function facets(g: BufferGeometry, palette: string[], shade: (triangle: number) => number) {
  const swatches = palette.map(hex => new Color(hex))
  const colors: number[] = []
  for (let t = 0; t < g.getAttribute('position').count / 3; t++) {
    const { r, g: green, b } = swatches[shade(t)]
    colors.push(r, green, b, r, green, b, r, green, b)
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return g
}

// Each lock sweeps from the parting through a broad ridge to its own tapered tip.
function hairLock(root: V3, bend: V3, tip: V3, width: number, outward: V3, color: string): Part {
  const along = new Vector3().fromArray(tip).sub(new Vector3().fromArray(root)).normalize()
  const across = new Vector3().crossVectors(along, new Vector3().fromArray(outward)).normalize()
  const normal = new Vector3().crossVectors(across, along)
  const ring = (center: V3, radius: number) => [
    new Vector3(...center).addScaledVector(across, radius).toArray(),
    new Vector3(...center).addScaledVector(normal, radius * .56).toArray(),
    new Vector3(...center).addScaledVector(across, -radius).toArray(),
    new Vector3(...center).addScaledVector(normal, -radius * .46).toArray(),
  ]
  const a = ring(root, width * .58), b = ring(bend, width)
  const vertices: number[] = [...a[0], ...a[1], ...a[2], ...a[0], ...a[2], ...a[3]]
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    vertices.push(...a[i], ...b[i], ...b[j], ...a[i], ...b[j], ...a[j], ...b[i], ...tip, ...b[j])
  }
  const lock = facets(surface(vertices), ['#ffffff', '#d1b9ac'], t => t >= 5 && t < 8 ? 1 : 0)
  return paint(lock, color, [0, 0, 0], [1, 1, 1])
}

const hair = shell([[-.105, .411, .350, .040], [.012, .486, .418], [.092, .383, .350], [.135, .179, .189, .007, .039]])
const tunic = shell([[.209, .412, .296, .013], [.346, .335, .246], [.530, .400, .286], [.596, .300, .225]])
const hem = shell([[.202, .416, .302, .013], [.230, .408, .298, .012]])
const edging = shell([[.225, .411, .301, .013], [.238, .405, .296, .011]])
const cuirass = fold([[-.40, .50], [.40, .50], [.50, .27], [.45, -.27], [.29, -.43],
  [0, -.50], [-.29, -.43], [-.45, -.27], [-.50, .27]], .25, [0, .10])
const pauldron = shell([[-.48, 1, 1], [-.24, .99, .99], [.26, .80, .84], [.50, .48, .60]])

// Pleats fan out behind the shoulders. The two faces share the same uneven hem.
function shortCape() {
  const collar: V3[] = [[-.185,.550,-.035],[-.136,.577,.095],[0,.582,.148],[.135,.577,.094],[.182,.554,-.042]]
  const hemline: V3[] = [[-.204,.285,.160],[-.123,.224,.258],[.065,.230,.228],[.234,.202,.295],[.412,.255,.156]]
  const front = [...collar, ...hemline]
  const back = front.map(([x,y,z]): V3 => [x,y,z - .018])
  const vertices: number[] = []
  for (let i = 0; i < 4; i++) {
    const j = i + 1
    vertices.push(...front[i], ...front[i+5], ...front[j+5], ...front[i], ...front[j+5], ...front[j],
      ...back[i], ...back[j+5], ...back[i+5], ...back[i], ...back[j], ...back[j+5],
      ...front[i+5], ...back[i+5], ...back[j+5], ...front[i+5], ...back[j+5], ...front[j+5],
      ...front[i], ...front[j], ...back[j], ...front[i], ...back[j], ...back[i])
  }
  vertices.push(...front[0], ...back[0], ...back[5], ...front[0], ...back[5], ...front[5],
    ...front[4], ...front[9], ...back[9], ...front[4], ...back[9], ...back[4])
  return facets(surface(vertices), ['#244491', '#355fc2', '#294eaa', '#426bcc', '#203679'],
    t => t < 32 && t % 8 < 2 ? Math.floor(t / 8) : 4)
}

const swordsman = bake([
  part(tunic, blue, [0,0,0], [1,1,1]),
  paint(hem, cream, [0,0,0], [1,1,1]),
  paint(edging, gold, [0,0,0], [1,1,1]),
  part(shortCape(), '#ffffff', [0,0,0], [1,1,1]),
  paint(cuirass, steel, [0,.472,-.110], [.411,.218,.289], [.08,0,0]),
  team(paint(band, cloth, [0,.343,0], [.371,.068,.284], [0,0,-.032])),
  team(paint(sash, cloth, [.104,.279,-.154], [.110,.166,.125], [-.14,0,-.18])),
  ...[-1,1].flatMap((side): Part[] => [
    paint(band, cream, [side*.206,.498,-.002], [.156,.131,.180], [0,0,side*.28]),
    paint(pauldron, steel, [side*.203,.552,-.003], [.209,.133,.225], [0,0,side*.22]),
    paint(gem, gold, [side*.142,.560,-.131], [.055,.055,.043]),
  ]),
  paint(band, steel, [.245,.440,-.060], [.143,.120,.148], [.34,0,.11]),
  paint(beveled, glove, [.248,.379,-.097], [.140,.113,.144], [.28,0,.09]),
  ...liftVisor([
    part(face, skin, [0,.760,-.012], [.457,.328,.405]),
    ...[-1,1].flatMap((side): Part[] => [
      paint(gem, skin, [side*.221,.765,-.006], [.110,.119,.119]),
      paint(eye, '#2e2227', [side*.083,.770,-.219], [.053,.084,1]),
      paint(patch, '#482a27', [side*.085,.816,-.217], [.112,.030,1], [0,0,side*.28]),
    ]),
    paint(patch, '#6d3c33', [0,.695,-.215], [.065,.011,1], [.15,0,-.025]),
    part(hair, chestnut, [0,.877,.018], [.96,.84,.96], [.36,0,-.035]),
    hairLock([.090,.973,.048],[.095,1.037,.083],[.163,1.088,.130],.075,[0,1,.35],'#88432f'),
    hairLock([.067,.997,.055],[-.040,1.037,.093],[-.219,1.066,.117],.098,[0,1,0],'#a05538'),
    hairLock([.081,.990,.046],[-.055,1.016,-.016],[-.268,.978,-.059],.102,[0,1,-.4],'#a95c3e'),
    hairLock([.070,.975,.014],[-.055,.964,-.122],[-.245,.915,-.171],.094,[0,.8,-1],'#80412d'),
    hairLock([.070,.952,-.066],[-.032,.910,-.186],[-.170,.832,-.225],.084,[0,.5,-1],'#a05537'),
    hairLock([.085,.951,-.065],[.112,.902,-.182],[.062,.844,-.225],.067,[0,.5,-1],'#92472f'),
    hairLock([.105,.983,.026],[.206,.941,-.045],[.267,.867,-.115],.072,[.8,.7,-.2],'#9e5436'),
    hairLock([.150,.925,-.037],[.203,.855,-.118],[.204,.777,-.133],.062,[1,0,-.6],'#713829'),
    hairLock([-.113,.958,.020],[-.214,.881,-.052],[-.239,.784,-.112],.067,[-1,.1,-.5],'#71402f'),
    hairLock([.060,.983,.084],[-.041,.943,.201],[-.151,.852,.250],.094,[0,.6,1],'#874531'),
    hairLock([.112,.966,.092],[.162,.897,.172],[.188,.811,.199],.075,[.6,.5,1],'#703a2e'),
  ], .22),
], .009)

// A diamond cross-section gives the straight steel blade two distinct cutting planes.
function swordBlade() {
  const rows = [[0,.044,.015],[.054,.060,.023],[.356,.051,.020]]
  const rings = rows.map(([y,w,d]): V3[] => [[-w,y,0],[0,y,-d],[w,y,0],[0,y,d]])
  const tip: V3 = [0,.491,0]
  const vertices: number[] = []
  for (let side = 0; side < 4; side++) {
    const j = (side + 1) % 4
    for (let row = 1; row < rings.length; row++) {
      const a = rings[row-1], b = rings[row]
      vertices.push(...a[side], ...b[side], ...b[j], ...a[side], ...b[j], ...a[j])
    }
    vertices.push(...rings[2][side], ...tip, ...rings[2][j])
  }
  return facets(surface(vertices), ['#91a6c7','#e6eef7','#99adca','#d4e2ee'], t => Math.floor(t / 5))
}
const bladeHand = bake([
  paint(band, steel, [-.034,-.042,-.020], [.136,.136,.142], [-.30,0,-.27]),
  paint(beveled, glove, [-.075,-.105,-.067], [.145,.123,.139], [-.10,0,-.10]),
  paint(barrel, '#62402f', [-.085,-.098,-.119], [.059,.184,.059]),
  paint(gem, gold, [-.085,-.192,-.119], [.082,.069,.077]),
  part(beveled, gold, [-.085,-.001,-.119], [.227,.059,.071], [0,0,.018]),
  lit(part(swordBlade(), '#ffffff', [-.085,.019,-.119], [1,1,1])),
], .008)

const coat = shell([[.254, .374, .280, .013], [.309, .406, .292, .010], [.501, .365, .262], [.594, .285, .225]])
const hood = shell([[.640, .320, .297, .045], [.728, .495, .403, .037], [.920, .521, .433, .038], [1.020, .348, .338, .059, -.016], [1.062, .115, .164, .106, -.054]])
const brimTip = fold([[-.50, -.34], [.13, -.49], [.50, -.22], [.39, .41], [.12, .26], [-.36, .46]], .14)
const mantle = fold([[-.48, .40], [-.12, .50], [.47, .33], [.42, -.14], [.12, -.47], [-.07, -.29], [-.35, -.50]], .10)
const quiver = shell([[-.50, .65, .68], [-.35, .85, .81], [.50, 1, 1]])
const pine = '#557515', leaf = '#8eac24'
const ranger = bake([
  part(coat, pine, [0, 0, 0], [1, 1, 1]),
  paint(box, leather, [0, .333, .005], [.377, .066, .273]),
  paint(box, brass, [.006, .333, -.142], [.083, .053, .027]),
  paint(box, '#a45e42', [.014, .455, -.125], [.059, .221, .028], [0, 0, .58]),
  paint(mantle, '#465f17', [0, .470, .156], [.365, .291, .18], [-.13, Math.PI, .10]),
  paint(band, leaf, [0, .563, .017], [.366, .121, .272]),
  ...liftVisor([
    part(hood, '#799922', [0, 0, 0], [1, 1, 1]),
    paint(face, '#e3a06e', [0, .787, -.069], [.398, .286, .324]),
    paint(box, '#9b5233', [0, .851, -.186], [.355, .089, .092], [0, 0, .055]),
    paint(taper, '#577716', [0, .714, -.204], [.277, .115, .145], [-.24, 0, -.05]),
    ...eyes(.815, -.234, .11),
    paint(gem, '#eaae7b', [0, .765, -.229], [.072, .058, .057]),
    ...[-1, 1].flatMap((side): Part[] => [
      part(cheekGuard, leaf, [side * .203, .785, -.078], [.091, .219, .30], [0, side * .33, side * -.14]),
      paint(taper, '#b8c850', [side * .191, .783, -.140], [.041, .094, .08], [0, side * .37, side * -.14]),
    ]),
    part(brimTip, leaf, [-.006, .918, -.159], [.466, .119, .49], [-.34, 0, .055]),
    paint(diamond, brass, [-.008, .916, -.235], [.089, .094, .040], [-.18, 0, .055]),
    part(feather, '#ffda8d', [-.209, 1.013, .038], [.168, .311, .320], [.61, -.14, .88]),
    team(part(feather, cloth, [-.170, 1.014, -.014], [.155, .275, .270], [.58, -.14, .71])),
  ], .15),
  // Diagonal quiver with two oversized vanes shows the class from the player's camera.
  part(quiver, '#865142', [-.104, .467, .173], [.123, .280, .118], [-.14, 0, -.39]),
  paint(box, brass, [-.060, .580, .155], [.133, .045, .125], [-.14, 0, -.39]),
  paint(feather, '#d0beda', [-.054, .630, .170], [.058, .113, .090], [-.18, .3, -.33]),
  paint(feather, '#a395ba', [-.009, .630, .172], [.061, .125, .090], [-.18, -.4, -.61]),
  paint(band, '#697d29', [-.192, .474, -.014], [.130, .166, .147], [-.19, 0, -.23]),
  part(beveled, '#9c5945', [-.209, .414, -.079], [.134, .131, .143], [-.38, 0, -.21]),
], .013)

// A beam on the crossbow deck, with its long axis in the XZ plane.
function strut(a: Point, b: Point, y: number, w: number, h: number, color: string) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  return paint(box, color, [(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2], [w, h, Math.hypot(dx, dz)], [0, Math.atan2(dx, dz), 0])
}
const crossbow = bake([
  paint(band, '#697d29', [-.019, .040, .009], [.117, .157, .141], [-.34, 0, -.22]),
  part(beveled, '#b66e4e', [0, -.030, -.051], [.132, .121, .137]),
  part(beveled, '#97563f', [0, .003, -.109], [.107, .104, .387]),
  paint(box, '#394f63', [0, .054, -.142], [.084, .052, .325]),
  paint(box, brass, [0, .039, -.266], [.134, .082, .072]),
  ...[-1, 1].flatMap((side): Part[] => [
    strut([side * .025, -.270], [side * .163, -.236], .052, .048, .052, '#d88a4e'),
    strut([side * .151, -.242], [side * .208, -.164], .053, .038, .048, brass),
    paint(gem, leaf, [side * .205, .053, -.163], [.054, .054, .057]),
  ]),
  lit(paint(box, '#ebddec', [0, .093, -.180], [.019, .019, .250])),
  lit(part(gem, '#c5b9d6', [0, .095, -.329], [.075, .051, .124])),
], .012)
const cord = bake([
  strut([-.204, 0], [0, .110], .061, .013, .013, '#ffe4a9'),
  strut([.204, 0], [0, .110], .061, .013, .013, '#ffe4a9'),
  lit(paint(feather, '#ffbf60', [0, .086, .100], [.041, .052, .142], [-.77, 0, 0])),
], .005)

const cap = (n: number) => Math.min(1, Math.max(0, n))
const ease = (n: number) => n * n * (3 - 2 * n)
const ramp = (t: number, start: number, end: number) => ease(cap((t - start) / (end - start)))
const meleeHip = .104, rangedHip = .097

function Hero({ pose, tint, ranged }: HeroProps & { ranged: boolean }) {
  const torso = useRef<Group>(null), weapon = useRef<Group>(null), string = useRef<Group>(null)
  const legA = useRef<Group>(null), legB = useRef<Group>(null)
  const hip = ranged ? rangedHip : meleeHip
  useFrame(() => {
    const body = torso.current, hand = weapon.current, left = legA.current, right = legB.current
    if (!body || !hand || !left || !right) return
    const t = Math.max(0, pose.t)
    const run = pose.anim === 'run', charging = pose.anim === 'charge'
    const attack = pose.anim === 'attack' ? cap(t / .34) : 0
    const special = pose.anim === 'special' ? cap(t / .40) : 0
    const fall = pose.anim === 'die' ? ramp(t, 0, .36) : 0
    const hurt = pose.anim === 'hurt' ? ramp(t, 0, .055) * (1 - ramp(t, .06, .28)) : 0
    const breath = Math.sin(t * 3.2), step = run ? Math.sin(t * 14) : 0
    const prepare = charging ? .28 + .72 * cap(pose.charge) : 0
    const attackWeight = ramp(attack, 0, .15) * (1 - ramp(attack, .60, 1))
    const release = ramp(attack, .1, .4) * (1 - ramp(attack, .55, 1))
    const specialWeight = ramp(special, 0, .13) * (1 - ramp(special, .65, 1))
    const kick = ranged ? release * .65 + specialWeight : 0
    const swing = ranged ? 0 : attackWeight * (.77 - 1.81 * ramp(attack, .17, .60))
    const spin = ranged ? 0 : ramp(special, .02, .88) * Math.PI * 2
    const rest = 1 - fall
    body.position.set(step * .016, (.008 + .006 * breath + Math.abs(step) * .035) * rest + fall * .14 - prepare * .019,
      (kick * .082 - release * .044) * rest)
    body.rotation.set((-.10 * Math.abs(step) + hurt * .24 + kick * .13) * rest, spin + swing * .47,
      step * .043 + hurt * .20 - fall * 1.52, 'YXZ')
    body.scale.set(1 + prepare * .023, 1 - prepare * .037, 1 + prepare * .023)
    const plantedHip = .257 - (run || fall > 0 ? 0 : body.position.y / body.scale.y)
    left.position.set(-hip, plantedHip + .045 * Math.max(0, step), 0)
    right.position.set(hip, plantedHip + .045 * Math.max(0, -step), 0)
    left.rotation.set(step * .67 - .06 * prepare, -.05, -.025 * Math.abs(step))
    right.rotation.set(-step * .67 + .09 * prepare, .05, .025 * Math.abs(step))
    if (ranged) {
      hand.position.set(.187 - .040 * prepare, .476 + prepare * .060, -.052 - prepare * .040 + kick * .086)
      hand.rotation.set(-.18 - .070 * step + .18 * prepare - .26 * kick, -.32 + .32 * prepare,
        -.16 + .25 * prepare - .13 * kick, 'YXZ')
      if (string.current) string.current.scale.z = 1 + prepare * .88 - kick * .45
    } else {
      hand.position.set(-.213, .525 + .115 * prepare - .018 * attackWeight, -.009 - .036 * release)
      hand.rotation.set(.55 - .16 * step - .36 * prepare - 2.10 * attackWeight - 1.91 * specialWeight,
        swing + .37 * specialWeight, .69 - .32 * prepare + .18 * specialWeight, 'YXZ')
    }
  })
  const boot = ranged ? rangerBoot : meleeBoot
  return (
    <group>
      <BlobShadow radius={.35} />
      <group ref={torso}>
        <Batch shape={ranged ? ranger : swordsman} pose={pose} tint={tint} />
        <group ref={legA} position={[-hip, .257, 0]}><Batch shape={boot} pose={pose} tint={tint} /></group>
        <group ref={legB} position={[hip, .257, 0]}><Batch shape={boot} pose={pose} tint={tint} /></group>
        <group ref={weapon} position={ranged ? [.187, .476, -.052] : [-.213, .525, -.009]}>
          <Batch shape={ranged ? crossbow : bladeHand} pose={pose} tint={tint} />
          {ranged && <group ref={string} position={[0, 0, -.163]}><Batch shape={cord} pose={pose} tint={tint} /></group>}
        </group>
      </group>
    </group>
  )
}

export function MeleeHero(props: HeroProps) { return <Hero {...props} ranged={false} /> }
export function RangedHero(props: HeroProps) { return <Hero {...props} ranged /> }

// Shared sculpting pieces for the other hero rigs. All sizes are in board cells.
export { shell, fold, beveled, band, toe, face, taper, diamond, eyes, liftVisor, part, paint, team, lit, ramp }
