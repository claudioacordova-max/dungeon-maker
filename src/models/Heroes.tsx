import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { BufferGeometry, Float32BufferAttribute, type Group } from 'three'
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

function boots(ranger: boolean) {
  const upper = ranger ? '#69505b' : '#613d42'
  return bake([
    paint(box, ranger ? '#345660' : '#38455b', [0, -.055, .010], [.135, .138, .130]),
    paint(band, upper, [0, -.143, .010], [.158, .123, .158]),
    paint(toe, ranger ? '#774b43' : '#8b533f', [0, -.198, -.024], [.176, .100, .222]),
    paint(box, '#332d3c', [0, -.241, -.025], [.162, .032, .195]),
    paint(box, ranger ? '#f9b762' : brass, [0, -.122, -.067], [.090, .034, .023]),
  ], .005)
}

const meleeBoot = boots(false), rangerBoot = boots(true)
const armor = shell([[.27, .28, .235], [.34, .36, .265], [.54, .425, .30], [.615, .29, .22]])
const copper = '#ce683d', gold = '#ffc869', cloth = '#fff3df'
const helmet = shell([[.846, .50, .43, .010], [.897, .525, .44, .014], [1.000, .448, .376, .030], [1.036, .255, .264, .037]])
const brim = shell([[.842, .512, .442, -.001], [.886, .547, .471, -.002]])
// A horsehair crest follows the crown from the forehead down to a flared tail.
// The sections are perpendicular to Z, with a slightly narrower top edge.
function helmetCrest() {
  const sections = [
    [-.194, .909, .955, .060], [-.148, .953, 1.055, .129],
    [-.036, .998, 1.116, .137], [.100, .987, 1.113, .138],
    [.186, .938, 1.078, .132], [.235, .966, 1.010, .097],
  ].map(([z, lo, hi, w]): V3[] => [[-w / 2, lo, z], [w / 2, lo, z], [w * .42, hi, z], [-w * .42, hi, z]])
  const vertices: number[] = []
  for (let k = 1; k < sections.length; k++) {
    const a = sections[k - 1], b = sections[k]
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      vertices.push(...a[i], ...a[j], ...b[j], ...a[i], ...b[j], ...b[i])
    }
  }
  const a = sections[0], b = sections[sections.length - 1]
  vertices.push(...a[0], ...a[2], ...a[1], ...a[0], ...a[3], ...a[2])
  vertices.push(...b[0], ...b[1], ...b[2], ...b[0], ...b[2], ...b[3])
  return surface(vertices)
}
const crest = helmetCrest()
const cheekGuard = fold([[-.45, .48], [.38, .49], [.50, .04], [.25, -.50], [-.36, -.24]], .23)
const sash = fold([[-.49, .50], [.49, .35], [.39, -.34], [.07, -.23], [-.18, -.50], [-.46, -.32]], .07)

const knight = bake([
  part(armor, '#316b79', [0, 0, 0], [1, 1, 1]),
  team(paint(band, cloth, [0, .561, .020], [.408, .125, .290])),
  team(paint(sash, cloth, [.023, .439, .159], [.229, .256, .10], [-.12, Math.PI, -.16])),
  paint(box, '#70433b', [0, .331, 0], [.355, .072, .257]),
  paint(box, gold, [.025, .332, -.139], [.091, .065, .031]),
  paint(box, leather, [-.048, .457, -.143], [.055, .239, .023], [0, 0, -.51]),
  paint(diamond, brass, [-.086, .496, -.162], [.068, .077, .042]),
  ...liftVisor([
    part(face, '#df9460', [0, .751, -.014], [.472, .345, .423]),
    paint(taper, '#a84836', [-.018, .643, -.201], [.237, .110, .075], [0, 0, -.03]),
    paint(box, '#592f34', [.014, .674, -.216], [.088, .021, .017], [0, 0, -.06]),
    ...eyes(.772, -.228, .22),
    paint(gem, '#f5ae70', [0, .720, -.227], [.091, .066, .066]),
    part(helmet, '#ae633e', [0, 0, 0], [1, 1, 1]),
    part(brim, gold, [0, 0, 0], [1, 1, 1]),
    ...[-1, 1].flatMap((side): Part[] => [
      part(cheekGuard, '#bf653f', [side * .223, .805, -.004], [.098, .198, .27], [0, side * .40, side * -.12]),
      paint(diamond, brass, [side * .237, .821, -.067], [.056, .079, .04]),
    ]),
    team(part(crest, cloth, [0, 0, 0], [1, 1, 1])),
    paint(diamond, '#ffe39b', [0, .927, -.207], [.105, .110, .095], [-.18, 0, 0]),
  ], .22),
  // A slung acorn-shaped buckler gives the back a copper silhouette above the scarf.
  paint(barrel, '#8d4837', [-.040, .445, .150], [.260, .084, .262], [Math.PI / 2, .1, -.17]),
  paint(diamond, gold, [-.044, .445, .202], [.152, .158, .076], [0, Math.PI, -.17]),
  part(beveled, copper, [.218, .502, .005], [.177, .157, .185], [0, 0, -.28]),
  paint(box, '#964939', [.255, .424, -.022], [.123, .129, .127], [-.16, 0, -.16]),
  part(beveled, gold, [.265, .393, -.060], [.151, .132, .157], [-.22, 0, -.11]),
], .013)

// The blade's midrib stands proud on both faces. Its nick and swept tip remain visible in silhouette.
const bladeRows = [
  [0, -.025, 0, .021, .012], [.056, -.078, .002, .062, .024],
  [.153, -.114, .009, .100, .027], [.182, -.082, .015, .104, .027],
  [.199, -.112, .018, .104, .027], [.303, -.071, .043, .094, .022],
  [.457, .078, .078, .078, 0],
]
function bladeGeometry(highlight: boolean) {
  const vertices: number[] = []
  for (let i = 1; i < bladeRows.length; i++) {
    const a = bladeRows[i - 1], b = bladeRows[i]
    for (const side of [-1, 1]) {
      const edge = side > 0 ? 3 : 1
      for (const faceDir of [-1, 1]) {
        if (highlight && side !== faceDir) continue
        const offset = highlight ? faceDir * .0015 : 0
        const ar: V3 = [a[2], a[0], faceDir * a[4] + offset], ae: V3 = [a[edge], a[0], offset]
        const br: V3 = [b[2], b[0], faceDir * b[4] + offset], be: V3 = [b[edge], b[0], offset]
        if (faceDir === side) vertices.push(...ar, ...ae, ...be, ...ar, ...be, ...br)
        else vertices.push(...ar, ...be, ...ae, ...ar, ...br, ...be)
      }
    }
  }
  return surface(vertices)
}
const blade = bladeGeometry(false), bladeFacet = bladeGeometry(true)
const bladeHand = bake([
  paint(box, '#356674', [-.030, -.036, -.008], [.127, .144, .139], [-.25, 0, -.28]),
  part(beveled, '#ae613e', [-.075, -.099, -.067], [.153, .127, .145], [-.10, 0, -.10]),
  paint(barrel, leather, [-.085, -.097, -.119], [.063, .192, .063]),
  paint(gem, gold, [-.085, -.191, -.119], [.096, .066, .085]),
  part(taper, gold, [-.085, -.003, -.119], [.242, .090, .275]),
  lit(part(blade, '#30a774', [-.085, .000, -.119], [1.1, 1.08, 1])),
  lit(paint(bladeFacet, '#b9ec72', [-.085, .000, -.119], [1.1, 1.08, 1])),
  paint(diamond, '#e9fb9b', [-.085, .032, -.145], [.050, .063, .035]),
], .012)

const coat = shell([[.254, .374, .280, .013], [.309, .406, .292, .010], [.501, .365, .262], [.594, .285, .225]])
const hood = shell([[.640, .320, .297, .045], [.728, .495, .403, .037], [.920, .521, .433, .038], [1.020, .348, .338, .059, -.016], [1.062, .115, .164, .106, -.054]])
const brimTip = fold([[-.50, -.34], [.13, -.49], [.50, -.22], [.39, .41], [.12, .26], [-.36, .46]], .14)
const mantle = fold([[-.48, .40], [-.12, .50], [.47, .33], [.42, -.14], [.12, -.47], [-.07, -.29], [-.35, -.50]], .10)
const quiver = shell([[-.50, .65, .68], [-.35, .85, .81], [.50, 1, 1]])
const pine = '#257d78', jade = '#40a18b'
const ranger = bake([
  part(coat, pine, [0, 0, 0], [1, 1, 1]),
  paint(box, leather, [0, .333, .005], [.377, .066, .273]),
  paint(box, brass, [.006, .333, -.142], [.083, .053, .027]),
  paint(box, '#a45e42', [.014, .455, -.125], [.059, .221, .028], [0, 0, .58]),
  team(paint(mantle, cloth, [0, .470, .156], [.365, .291, .18], [-.13, Math.PI, .10])),
  team(paint(band, cloth, [0, .563, .017], [.366, .121, .272])),
  ...liftVisor([
    part(hood, pine, [0, 0, 0], [1, 1, 1]),
    paint(face, '#ba7859', [0, .787, -.069], [.398, .286, .324]),
    paint(box, '#8c4b41', [0, .851, -.186], [.355, .089, .092], [0, 0, .055]),
    paint(taper, '#347068', [0, .714, -.204], [.277, .115, .145], [-.24, 0, -.05]),
    ...eyes(.815, -.234, .11),
    paint(gem, '#da8f68', [0, .765, -.229], [.072, .058, .057]),
    ...[-1, 1].flatMap((side): Part[] => [
      part(cheekGuard, jade, [side * .203, .785, -.078], [.091, .219, .30], [0, side * .33, side * -.14]),
      paint(taper, '#afebbd', [side * .191, .783, -.140], [.041, .094, .08], [0, side * .37, side * -.14]),
    ]),
    part(brimTip, jade, [-.006, .918, -.159], [.466, .119, .49], [-.34, 0, .055]),
    paint(diamond, brass, [-.008, .916, -.235], [.089, .094, .040], [-.18, 0, .055]),
    part(feather, '#ffda8d', [-.209, 1.013, .038], [.168, .311, .320], [.61, -.14, .88]),
    team(part(feather, cloth, [-.170, 1.014, -.014], [.155, .275, .270], [.58, -.14, .71])),
  ], .15),
  // Diagonal quiver with two oversized vanes shows the class from the player's camera.
  part(quiver, '#865142', [-.104, .467, .173], [.123, .280, .118], [-.14, 0, -.39]),
  paint(box, brass, [-.060, .580, .155], [.133, .045, .125], [-.14, 0, -.39]),
  paint(feather, '#ffb566', [-.054, .630, .170], [.058, .113, .090], [-.18, .3, -.33]),
  paint(feather, '#f77653', [-.009, .630, .172], [.061, .125, .090], [-.18, -.4, -.61]),
  paint(band, '#48686e', [-.192, .474, -.014], [.130, .166, .147], [-.19, 0, -.23]),
  part(beveled, '#9c5945', [-.209, .414, -.079], [.134, .131, .143], [-.38, 0, -.21]),
], .013)

// A beam on the crossbow deck, with its long axis in the XZ plane.
function strut(a: Point, b: Point, y: number, w: number, h: number, color: string) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  return paint(box, color, [(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2], [w, h, Math.hypot(dx, dz)], [0, Math.atan2(dx, dz), 0])
}
const crossbow = bake([
  paint(band, '#48686e', [-.019, .040, .009], [.117, .157, .141], [-.34, 0, -.22]),
  part(beveled, '#b66e4e', [0, -.030, -.051], [.132, .121, .137]),
  part(beveled, '#97563f', [0, .003, -.109], [.107, .104, .387]),
  paint(box, '#394f63', [0, .054, -.142], [.084, .052, .325]),
  paint(box, brass, [0, .039, -.266], [.134, .082, .072]),
  ...[-1, 1].flatMap((side): Part[] => [
    strut([side * .025, -.270], [side * .163, -.236], .052, .048, .052, '#d88a4e'),
    strut([side * .151, -.242], [side * .208, -.164], .053, .038, .048, brass),
    paint(gem, jade, [side * .205, .053, -.163], [.054, .054, .057]),
  ]),
  lit(paint(box, '#c1ece5', [0, .093, -.180], [.019, .019, .250])),
  lit(part(gem, '#91e5d8', [0, .095, -.329], [.075, .051, .124])),
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
        <Batch shape={ranged ? ranger : knight} pose={pose} tint={tint} />
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
