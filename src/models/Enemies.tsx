import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { BufferGeometry, Float32BufferAttribute, TorusGeometry, type Group } from 'three'
import { BlobShadow } from './Effects'
import { eyeLayers, eyePaint, maestroEyes, recolor } from './MaestroEyes'
import { bake, ball, barrel, Batch, box, gem, type Part, type V3 } from './kit'
import type { Pose } from './types'

type Point = [number, number]
type Ring = [height: number, radiusX: number, radiusZ: number, centerZ?: number, centerX?: number]
const tau = Math.PI * 2
const soot = '#201734'
const cream = '#ffefc7'

function geometry(vertices: number[], indices: number[]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

// Closed polygon rings let a silhouette bend or bulge without stacking spheres.
function loft(profile: Ring[], sides: number) {
  const vertices: number[] = []
  const indices: number[] = []
  for (const [y, rx, rz, z = 0, x = 0] of profile) {
    for (let i = 0; i < sides; i++) {
      const a = tau * i / sides
      vertices.push(x + Math.sin(a) * rx, y, z - Math.cos(a) * rz)
    }
  }
  for (let ring = 1; ring < profile.length; ring++) {
    for (let i = 0; i < sides; i++) {
      const lo = (ring - 1) * sides
      const j = (i + 1) % sides
      indices.push(lo + i, lo + sides + i, lo + j, lo + j, lo + sides + i, lo + sides + j)
    }
  }
  const top = (profile.length - 1) * sides
  for (let i = 1; i < sides - 1; i++) indices.push(0, i, i + 1, top, top + i + 1, top + i)
  return geometry(vertices, indices)
}

const domeRings: Point[] = [
  [0, .34], [.08, .465], [.27, .5], [.50, .47], [.70, .409], [.88, .30], [.97, .17], [1, .045],
]
const domeSides = 12
const dome = loft(domeRings.map(([y, r]) => [y, r, r]), domeSides)

function domeRadius(y: number) {
  for (let i = 1; i < domeRings.length; i++) {
    const [h, r] = domeRings[i]
    if (y <= h) {
      const [prevH, prevR] = domeRings[i - 1]
      return prevR + (r - prevR) * (y - prevH) / (h - prevH)
    }
  }
  return domeRings[domeRings.length - 1][1]
}

// Follow the actual faceted skin. The fan also samples the middle of the graphic,
// keeping the broad eye whites and mouth on the surface when the entire jelly flexes.
function skinPatch(points: Point[], c: string, s: V3, depth: number, around = 0): Part {
  const vertices: number[] = []
  const indices: number[] = []
  function sample(x: number, y: number) {
    const r = domeRadius(y)
    const ax = Math.abs(x)
    const step = tau / domeSides
    const angle = Math.asin(Math.min(.999, ax / r))
    const a = Math.floor(angle / step) * step
    const f = (ax - r * Math.sin(a)) / (r * (Math.sin(a + step) - Math.sin(a)))
    const z = -r * (Math.cos(a) + f * (Math.cos(a + step) - Math.cos(a))) - depth
    vertices.push(x * Math.cos(around) - z * Math.sin(around), y + depth * .4,
      x * Math.sin(around) + z * Math.cos(around))
  }
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]
    const [nx, ny] = points[(i + 1) % points.length]
    area += x * ny - y * nx
    cx += x
    cy += y
  }
  cx /= points.length
  cy /= points.length
  const split = points.length >= 6 || points.some(([x, y]) => Math.abs(x - cx) > .085 || Math.abs(y - cy) > .09)
  function triangle(a: Point, b: Point, c: Point) {
    const first = vertices.length / 3
    sample(...a)
    sample(...b)
    sample(...c)
    if (area > 0) indices.push(first,first + 2,first + 1)
    else indices.push(first,first + 1,first + 2)
  }
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (split) {
      const ca: Point = [(cx + a[0]) / 2,(cy + a[1]) / 2]
      const cb: Point = [(cx + b[0]) / 2,(cy + b[1]) / 2]
      const ab: Point = [(a[0] + b[0]) / 2,(a[1] + b[1]) / 2]
      triangle([cx,cy],ca,cb)
      triangle(ca,a,ab)
      triangle(ab,b,cb)
      triangle(ca,ab,cb)
    } else triangle([cx,cy],a,b)
  }
  return { g: geometry(vertices, indices), c, s, ink: false }
}

function slimeFace(s: V3, royal: boolean, possessed: boolean) {
  const face: Part[] = []
  for (const side of [-1, 1]) {
    function eye(points: Point[], color: string, depth: number) {
      face.push(skinPatch(points.map(([x, y]) => [side * x, royal ? .65 + .82 * (y - .65) : y]), color, s, depth))
    }
    eye([[.025,.668],[.212,.80],[.292,.795],[.274,.644],[.217,.518],[.095,.50],[.040,.555]], soot, .010)
    if (possessed) continue
    eye([[.054,.649],[.240,.739],[.245,.667],[.198,.556],[.101,.542],[.067,.570]], cream, .019)
    eye([[.081,.644],[.118,.673],[.151,.653],[.145,.585],[.106,.562],[.078,.592]],
      royal ? '#a42a67' : '#11564b', .026)
    eye([[.086,.657],[.106,.666],[.113,.643],[.096,.629]], '#fffbe4', .031)
  }
  face.push(skinPatch([[-.174,.427],[-.085,.407],[.037,.422],[.186,.478],[.153,.359],[.054,.288],[-.057,.302],[-.147,.361]], soot,s,.012))
  face.push(skinPatch([[-.071,.329],[.008,.350],[.085,.345],[.045,.306],[-.041,.313]], '#ff7893',s,.020))
  face.push(skinPatch([[.088,.425],[.146,.446],[.118,.364]],cream,s,.024))
  if (royal) {
    // Two swept moustache lobes turn the little slime's grin into a regal scowl.
    for (const side of [-1, 1]) {
      const whisker: Point[] = [[.002,.431],[.058,.482],[.141,.456],[.236,.442],[.304,.521],
        [.282,.412],[.212,.360],[.141,.365],[.075,.398],[.022,.394]]
      face.push(skinPatch(whisker.map(([x,y]) => [x * side,y]),'#531f65',s,.031))
      face.push(skinPatch(whisker.map(([x,y]) => [x * side,.44 + (y - .44) * .70 + .011]),'#f4b2dc',s,.050))
    }
  }
  return face
}

const smallSize: V3 = [.82, .59, .73]
const gloss: Point[] = [[.064,.911],[.079,.934],[.119,.947],[.164,.940],[.201,.923],
  [.228,.901],[.247,.873],[.237,.854],[.206,.862],[.158,.893],[.105,.905]]
function jellyEyes(size: V3, royal: boolean) {
  return bake([-1,1].flatMap(side => eyeLayers(side).map(({points,color}, i) =>
    skinPatch(points.map(([x,y]) => [side*.152 + x*.243, .648 + y*(royal ? .207 : .254)]),
      color,size,.025+i*.012))), 0).color
}
const slimeEyes = jellyEyes(smallSize,false)
const slimeParts: Part[] = [
  { g: dome, c: '#58ce45', s: smallSize },
  // A raised, swept-back jelly curl and its little satellite survive an overhead view.
  { g: loft([[0,.091,.08],[.05,.087,.078,.012],[.12,.055,.05,.055],[.16,.014,.014,.100]], 7),
    c: '#9beb43', p: [-.075,.55,.018] },
  { g: gem, c: '#ceff8a', p: [.10,.574,.045], s: [.095,.068,.095], ink: false },
  skinPatch(gloss, '#dbff9c', smallSize,.019),
  skinPatch([[-.14,.64],[-.015,.79],[.065,.77],[.041,.69],[-.078,.599]], '#a5ef66', smallSize,.012,Math.PI),
]
const slimeShape = bake([...slimeParts,...slimeFace(smallSize,false,false)],.013)
const possessedSlime = bake([...recolor(slimeParts,{ '#58ce45':'#983ed5', '#9beb43':'#c477ee',
  '#ceff8a':'#f3c6ff', '#dbff9c':'#edb2ff', '#a5ef66':'#c478eb' }),...slimeFace(smallSize,false,true)],.013)

const kingSize: V3 = [2.38, 1.43, 2.12]

// The mantle is open at the chin. Its wavy hem goes all the way around the back.
function mantle(low: number, high: number, flare: number, scallop: number) {
  const vertices: number[] = []
  const indices: number[] = []
  const steps = 20
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i <= steps; i++) {
      const a = .99 + (tau - 1.98) * i / steps
      const y = low + (high - low) * j / 2 + (1 - j / 2) * scallop * (.5 + .5 * Math.cos(i * Math.PI / 2))
      const r = domeRadius(y) + flare + (1 - j / 2) * .012
      vertices.push(kingSize[0] * r * Math.sin(a), kingSize[1] * y, -kingSize[2] * r * Math.cos(a))
    }
  }
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < steps; i++) {
      const n = j * (steps + 1) + i
      const up = n + steps + 1
      indices.push(n, up, n + 1, n + 1, up, up + 1)
    }
  }
  return geometry(vertices, indices)
}

function crown() {
  const vertices: number[] = []
  const indices: number[] = []
  const sides = 12
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < sides; i++) {
      const tip = i % 2 === 0
      const top = row === 1 || row === 2
      const a = tau * i / sides
      const r = (top ? (tip ? .535 : .455) : .425) - (row >= 2 ? .045 : 0)
      const y = top ? (tip ? (i === 0 ? .53 : .43) : .21) : 0
      vertices.push(r * Math.sin(a), y, -r * Math.cos(a))
    }
  }
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides
      const lo = row * sides
      const hi = ((row + 1) % 4) * sides
      indices.push(lo + i, hi + i, lo + j, lo + j, hi + i, hi + j)
    }
  }
  return geometry(vertices, indices)
}

const kingParts: Part[] = [
  { g: dome, c: '#65c94a', s: kingSize },
  { g: mantle(.12,.69,.019,.086), c: '#bb3263', ink: false },
  { g: mantle(.12,.176,.025,.086), c: '#ffb249', ink: false },
  { g: mantle(.60,.73,.028,.026), c: '#fff1cb', ink: false },
  skinPatch([[-.17,.405],[0,.505],[.17,.405],[0,.227]], '#fbc949', kingSize,.041, Math.PI),
  skinPatch([[-.074,.385],[0,.435],[.074,.385],[0,.308]], '#7e285f', kingSize,.052, Math.PI),
  skinPatch(gloss, '#d8ff9f', kingSize,.019),
]
const kingBody = bake([...kingParts,...slimeFace(kingSize,true,false)],.029)
const possessedKing = bake([...recolor(kingParts,{ '#65c94a':'#a25be6', '#d8ff9f':'#f5c6ef' }),
  ...slimeFace(kingSize,true,true)],.029)
const kingEyes = jellyEyes(kingSize,true)

const kingCrown = bake([
  { g: crown(), c: '#ffbd36' },
  { g: barrel, c: '#ffe479', p: [0,.067,0], s: [.888,.089,.888], ink: false },
  { g: ball, c: '#b92365', p: [0,.126,0], s: [.74,.39,.74], ink: false },
  { g: gem, c: '#ffe084', p: [0,.301,0], s: [.13,.135,.13], ink: false },
  { g: gem, c: '#fff1a0', p: [0,.239,-.448], s: [.225,.290,.099], ink: false },
  { g: gem, c: '#ff3666', p: [0,.242,-.490], s: [.154,.206,.076], ink: false, glow: true },
  { g: gem, c: '#ff586e', p: [0,.205,.461], s: [.133,.170,.074], ink: false },
], .016)

const spitBead = bake([
  { g: ball, c: '#ae48e5', s: [.31,.29,.35] },
  { g: new TorusGeometry(.15,.020,3,6), c: '#ceff8b', r: [.90,.2,-.35] },
  { g: gem, c: '#edffc3', p: [-.046,.085,-.092], s: [.122,.095,.093] },
],0)

function unit(t: number) { return Math.min(1, Math.max(0, t)) }
function hit(t: number, duration: number) { return Math.sin(Math.PI * unit(t / duration)) }

type EnemyProps = { pose: Pose; possessed?: boolean }
function Jelly({ pose, royal, possessed = false }: EnemyProps & { royal: boolean }) {
  const body = useRef<Group>(null)
  const crownRef = useRef<Group>(null)
  const spitRef = useRef<Group>(null)
  const shadow = useRef<Group>(null)
  useFrame(() => {
    const jelly = body.current
    if (!jelly || !shadow.current) return
    const { anim, charge } = pose
    const t = anim === 'die' ? Math.min(.38,pose.t) : pose.t
    const breathe = Math.sin(t * (royal ? 3.3 : 5.6))
    let width = 1 + breathe * .021
    let height = 1 - breathe * .03
    let lift = 0
    let lean = 0
    let roll = breathe * .021
    let scale = 1
    let crownLift = 0
    if (anim === 'run') {
      const beat = tau * t * (royal ? 1.75 : 2.75)
      const flight = Math.max(0, Math.sin(beat))
      const squat = Math.max(0, -Math.sin(beat))
      lift = flight * (royal ? .19 : .155)
      width = 1 + .12 * squat - .082 * flight
      height = 1 - .19 * squat + .16 * flight
      roll = Math.sin(beat * .5) * .068
      lean = -.10 * flight
      crownLift = .077 * flight
    } else if (anim === 'windup' || anim === 'charge') {
      const force = .20 + .80 * unit(charge)
      width = 1 + .21 * force
      height = 1 - .31 * force
      roll = Math.sin(t * 33) * .026 * force
      lean = .09 * force
    } else if (anim === 'jump') {
      width = .86 + breathe * .028
      height = 1.30 - breathe * .035
      lean = -.095
      crownLift = .105
    } else if (anim === 'land') {
      const squash = hit(t + .06,.27)
      const bounce = t > .19 ? hit(t - .19,.17) : 0
      width = 1 + .34 * squash - .05 * bounce
      height = 1 - .42 * squash + .10 * bounce
      crownLift = .105 * bounce
    } else if (anim === 'throw') {
      const spit = hit(t,.25)
      const recoil = t > .14 ? hit(t - .14,.19) : 0
      lean = -.27 * spit + .12 * recoil
      width = 1 - .11 * spit
      height = 1 + .11 * spit
      crownLift = .056 * recoil
    } else if (anim === 'hurt') {
      const impact = hit(t,.27)
      width = 1 + .17 * impact
      height = 1 - .22 * impact
      roll = -.15 * impact
      lean = .13 * impact
    } else if (anim === 'die') {
      const flatten = unit(t / .18)
      scale = 1 - .94 * unit((t - .13) / .25)
      width = 1 + .33 * flatten
      height = 1 - .86 * flatten
      roll = 0
    }
    jelly.scale.set(width * scale, height * scale, width * scale)
    jelly.position.y = lift
    jelly.rotation.set(lean,0,roll)
    // The game lifts the entire boss rig for a jump. Keep the contact shadow on
    // the world floor while the crown and the body travel with the parent.
    const ground = shadow.current
    let jumpHeight = 0
    if (royal && anim === 'jump' && ground.parent) {
      ground.parent.updateWorldMatrix(true, false)
      const world = ground.parent.matrixWorld.elements
      jumpHeight = world[13]
      ground.position.y = -jumpHeight / (world[5] || 1)
    } else {
      ground.position.y = 0
    }
    const shadowWidth = scale * (1 - lift * .4) / (1 + Math.max(0, jumpHeight) * .22)
    ground.scale.set(shadowWidth, 1, shadowWidth)
    if (crownRef.current) {
      crownRef.current.position.y = 1.276 + crownLift
      crownRef.current.rotation.set(.045 - lean * .25,.18,-.092 - roll * .7)
    }
    if (spitRef.current) {
      const spit = spitRef.current
      spit.visible = anim === 'throw' && t > .005 && t < .32
      if (spit.visible) {
        const travel = unit((t - .062) / .23)
        spit.position.set(0,.50 + .14 * Math.sin(Math.PI * travel),-1.02 - .91 * travel)
        spit.scale.setScalar(unit(t / .066) * (1 - unit((t - .19) / .13)))
        spit.rotation.z = travel * 2.3
      }
    }
  })
  return (
    <group>
      <group ref={shadow}><BlobShadow radius={royal ? 1.13 : .39} /></group>
      <group ref={body}>
        <Batch shape={royal ? (possessed ? possessedKing : kingBody) : (possessed ? possessedSlime : slimeShape)} pose={pose} />
        {possessed && <mesh geometry={royal ? kingEyes : slimeEyes} material={eyePaint} dispose={null} />}
        {royal && <group ref={crownRef} position={[0,1.276,.05]} rotation={[.045,.18,-.092]}>
          <Batch shape={kingCrown} pose={pose} />
        </group>}
        {royal && <group ref={spitRef} visible={false}><Batch shape={spitBead} pose={pose} /></group>}
      </group>
    </group>
  )
}

export function Slime(props: EnemyProps) { return <Jelly {...props} royal={false} /> }
export function SlimeKing(props: EnemyProps) { return <Jelly {...props} royal /> }

// A bevel around the cheek and the hood opening makes their rim catch light from above.
function bevel(points: Point[]) {
  const vertices: number[] = []
  const indices: number[] = []
  const n = points.length
  for (const [scale, z] of [[.77,-.5],[1,-.31],[.94,.5]]) {
    for (const [x, y] of points) vertices.push(x * scale,y * scale,z)
  }
  for (let i = 1; i < n - 1; i++) indices.push(0,i + 1,i,2 * n,2 * n + i,2 * n + i + 1)
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < n; i++) {
      const lo = row * n
      const j = (i + 1) % n
      indices.push(lo + i,lo + j,lo + i + n,lo + j,lo + j + n,lo + i + n)
    }
  }
  return geometry(vertices,indices)
}

const mask = bevel([[-.49,.19],[-.41,-.24],[-.21,-.43],[.08,-.48],[.39,-.32],[.50,.085],[.33,.40],[-.18,.48]])
const eyeBadge = geometry(
  [-.5,.13,-.5, -.39,-.29,-.5, -.09,-.48,-.5, .35,-.34,-.5, .5,.07,-.5, .43,.40,-.5, -.10,.32,-.5],
  [0,2,1, 0,3,2, 0,4,3, 0,5,4, 0,6,5],
)
const faceTilt = .51
function goblinDetail(g: BufferGeometry, c: string, x: number, y: number, z: number, s: V3, roll = 0): Part {
  return { g, c, s, p: [x, .705 + y * Math.cos(faceTilt) - z * Math.sin(faceTilt),
    -.253 + y * Math.sin(faceTilt) + z * Math.cos(faceTilt)], r: [faceTilt,0,roll], ink: false }
}

const casterParts: Part[] = [
  // A narrow coat and wide hood leave a clear waist even at game scale.
  { g: loft([[.12,.215,.169],[.18,.225,.167],[.34,.154,.13],[.44,.207,.155],[.49,.163,.116]],8), c: '#51427c' },
  { g: barrel, c: '#f65a79', p: [0,.336,0], s: [.334,.081,.290], ink: false },
  { g: gem, c: '#ffcb53', p: [0,.335,-.145], s: [.087,.092,.038], ink: false },
  { g: loft([[.474,.16,.137],[.57,.256,.236],[.74,.292,.265,.025],
    [.865,.259,.230,.056],[.963,.160,.155,.119],[1.012,.090,.090,.198],[.995,.022,.035,.31,.030]],10),
    c: '#903cb5' },
  // The hood ends in a bright tassel over the back seam.
  { g: gem, c: '#ffd35d', p: [.029,.978,.306], s: [.103,.14,.10], ink: false },
  { g: box, c: '#da5cbb', p: [0,.635,.254], s: [.058,.24,.034], r: [.28,0,0], ink: false },
  { g: gem, c: '#ffa75a', p: [0,.722,.296], s: [.128,.127,.033], r: [.21,0,0], ink: false },
  goblinDetail(mask,'#53295e',0,0,.008,[.55,.477,.124]),
  goblinDetail(mask,'#a7d351',0,-.016,-.040,[.468,.362,.126]),
  goblinDetail(eyeBadge,soot,0,-.088,-.112,[.185,.066,.011],.015),
  goblinDetail(gem,cream,-.065,-.091,-.128,[.040,.080,.030],-.19),
  goblinDetail(gem,cream,.063,-.091,-.128,[.040,.080,.030],.18),
  goblinDetail(gem,'#d3dd53',0,-.014,-.124,[.159,.148,.172]),
  { g: barrel, c: '#66428e', p: [.205,.387,-.016], s: [.17,.20,.161], r: [-.48,0,.34] },
  { g: gem, c: '#b7d95e', p: [.246,.316,-.110], s: [.155,.148,.173] },
]
const goblinEyes: Part[] = []
for (const side of [-1, 1]) {
  // Pointed ears extend beyond the hood and read when only its back is visible.
  casterParts.push(
    { g: loft([[.665,.040,.042,.012,.254 * side],[.727,.109,.063,-.006,.299 * side],
      [.801,.073,.043,.002,.353 * side],[.855,.011,.012,.022,.420 * side]], 5), c: '#8fc849' },
    { g: gem, c: '#f19676', p: [.333 * side,.762,-.049], s: [.155,.073,.040], r: [0,0,side * .48], ink: false },
    goblinDetail(eyeBadge,soot,.105 * side,.043,-.105,[.154,.105,.024],side * .22),
    goblinDetail(box,'#526238',.109 * side,.096,-.100,[.155,.035,.026],side * .27),
  )
  goblinEyes.push(
    goblinDetail(eyeBadge,'#fff0a5',.107 * side,.039,-.125,[.119,.079,.016],side * .22),
    goblinDetail(gem,soot,.087 * side,.039,-.141,[.041,.068,.019]),
  )
}
// A single gold ear hoop breaks the bilateral silhouette.
casterParts.push({ g: new TorusGeometry(.036,.010,4,8), c: '#ffd35d', p: [.349,.717,-.013], ink: false })
const casterBody = bake([...casterParts,...goblinEyes],.012)
const possessedCaster = bake(recolor(casterParts,{
  '#a7d351':'#a259d3', '#d3dd53':'#ca88ea', '#b7d95e':'#c17ae0', '#8fc849':'#9e55c8',
  '#f19676':'#cd92dd', '#526238':'#592870', '#903cb5':'#70299e',
}),.012)
const casterEyes = bake(maestroEyes(.105,.805,-.357,.144,.090,faceTilt),0).color
const boots = bake([
  { g: mask, c: '#49304a', p: [-.104,.084,-.022], s: [.17,.17,.243] },
  { g: mask, c: '#49304a', p: [.104,.084,-.022], s: [.17,.17,.243] },
],.009)
const armParts: Part[] = [
  { g: barrel, c: '#754497', p: [-.041,-.040,-.033], s: [.153,.194,.155], r: [.68,0,-.64] },
  { g: barrel, c: '#ffb44e', p: [-.076,-.09,-.087], s: [.156,.055,.15], r: [.69,0,-.72], ink: false },
  { g: gem, c: '#acd84e', p: [-.099,-.081,-.136], s: [.153,.145,.163] },
]
const castingArm = bake(armParts,.010)
const possessedArm = bake(recolor(armParts,{ '#acd84e':'#bf7ee4' }),0)
const castingOrb = bake([
  { g: ball, c: '#a84ced', s: [.165,.165,.165], glow: true },
  { g: new TorusGeometry(.089,.013,4,10), c: '#bbff73', r: [1.10,.10,-.30], glow: true },
  { g: gem, c: '#daff9e', p: [-.019,.052,-.049], s: [.078,.055,.063], glow: true },
],0)

export function Thrower({ pose, possessed = false }: EnemyProps) {
  const torso = useRef<Group>(null)
  const stride = useRef<Group>(null)
  const hand = useRef<Group>(null)
  const orb = useRef<Group>(null)
  const shadow = useRef<Group>(null)
  useFrame(() => {
    if (!torso.current || !stride.current || !hand.current || !orb.current || !shadow.current) return
    const { anim, charge } = pose
    const t = anim === 'die' ? Math.min(.36,pose.t) : pose.t
    const breath = Math.sin(t * 4.8)
    let bob = breath * .012
    let lean = 0
    let twist = breath * .025
    let roll = 0
    let feet = 0
    let arm = -.38 + .075 * breath
    let spread = -.08
    let orbScale = .77 + .037 * breath
    let orbLift = .008 * breath
    let reach = 0
    let shrink = 1
    if (anim === 'run') {
      const step = Math.sin(t * 14.2)
      feet = step * .95
      lean = -.105
      bob = .072 * Math.abs(step)
      twist = -.12 * step
      roll = .067 * step
      arm += .48 * step
    } else if (anim === 'windup' || anim === 'charge') {
      const amount = unit(charge)
      // Sweep the palm out from under the hood, then lift the growing orb above the ear.
      arm = .12 + amount * .70
      spread = -.95 - amount * .62
      reach = .42 + .58 * amount
      twist = .18 + amount * .22
      roll = -.085 - amount * .04
      bob = -.025 * amount
      orbScale = 1.04 + .98 * amount + .04 * Math.sin(t * 22)
      orbLift = .025 + .017 * Math.sin(t * 8)
    } else if (anim === 'throw' || anim === 'attack') {
      const sling = hit(t,.30)
      arm = .82 - sling * 1.90
      spread = -1.57 + sling * 1.31
      // Finish the arm recovery even when the game keeps the final pose for another tick.
      const recover = unit((t - .16) / .20)
      reach = 1 - recover
      arm += (-.38 - .82) * recover
      spread += (-.08 + 1.57) * recover
      lean = -.20 * sling
      twist = -.40 * sling
      orbScale = 1.95 * (1 - unit(t / .085)) + .77 * unit((t - .17) / .18)
    } else if (anim === 'hurt') {
      const impact = hit(t,.26)
      roll = -.24 * impact
      lean = .18 * impact
      bob = -.035 * impact
      spread = -.08 - .53 * impact
    } else if (anim === 'die') {
      const fall = unit(t / .30)
      roll = 1.30 * fall
      lean = .26 * fall
      bob = -.03 * fall
      shrink = 1 - .97 * unit((t - .10) / .26)
      orbScale *= 1 - fall
    }
    torso.current.position.y = bob * shrink
    torso.current.rotation.set(lean,twist,roll)
    torso.current.scale.setScalar(shrink)
    stride.current.rotation.y = feet
    stride.current.scale.setScalar(shrink)
    shadow.current.scale.setScalar(shrink)
    hand.current.position.set(-.206 - .13 * reach,.453 + .11 * reach,-.012)
    hand.current.rotation.set(arm,0,spread)
    orb.current.position.set(-.099,-.081,-.136).applyEuler(hand.current.rotation).add(hand.current.position)
    orb.current.position.x -= .024 + .022 * reach
    orb.current.position.y += .125 + orbLift + .047 * reach
    orb.current.scale.setScalar(orbScale)
    orb.current.rotation.y = t * 2.7
  })
  return <group>
    <group ref={shadow}><BlobShadow radius={.34} /></group>
    <group ref={stride}><Batch shape={boots} pose={pose} /></group>
    <group ref={torso}>
      <Batch shape={possessed ? possessedCaster : casterBody} pose={pose} />
      {possessed && <mesh geometry={casterEyes} material={eyePaint} dispose={null} />}
      <group ref={hand} position={[-.206,.453,-.012]} rotation={[-.38,0,-.08]}>
        <Batch shape={possessed ? possessedArm : castingArm} pose={pose} />
      </group>
      <group ref={orb} position={[-.335,.46,-.11]} scale={.77}><Batch shape={castingOrb} pose={pose} /></group>
    </group>
  </group>
}

export { loft }
