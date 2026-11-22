import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry, CircleGeometry, DataTexture, DynamicDrawUsage, Float32BufferAttribute, Group,
  InstancedMesh, LinearFilter, MeshBasicMaterial, Object3D, PlaneGeometry, Quaternion, RingGeometry, SpriteMaterial, SRGBColorSpace,
  type Mesh,
} from 'three'
import { bake, ball, gem, toon, type Part } from './kit'
import { loft } from './Enemies'
import { fold, ramp } from './Heroes'

const tau = 2 * Math.PI
export const spellPaint = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })

// A pinched, double-sided four-point star. Its ridge still catches the eye edge-on.
function starGeometry() {
  const vertices: number[] = []
  for (let i = 0; i < 8; i++) {
    const point = (n: number) => {
      const radius = n % 2 ? .14 : .5
      return [radius * Math.cos(n * tau / 8), radius * Math.sin(n * tau / 8), 0]
    }
    const a = point(i), b = point(i + 1)
    vertices.push(...a, ...b, 0, 0, .15, ...b, ...a, 0, 0, -.15)
  }
  const shape = new BufferGeometry()
  shape.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  shape.computeVertexNormals()
  return shape
}
const star = starGeometry()
const light = bake([
  { g: ball, c: '#fff5ba', s: [.22,.22,.22] },
  { g: gem, c: '#ffcf55', p: [0,0,.12], s: [.135,.13,.30] },
  { g: gem, c: '#fff7c4', p: [.026,.012,.30], s: [.044,.044,.11] },
], 0).color
const fire = bake([
  { g: gem, c: '#ff5723', s: [.22,.21,.42] },
  { g: gem, c: '#ffad30', p: [-.038,.038,-.034], s: [.17,.16,.31] },
  { g: gem, c: '#fff3a3', p: [-.06,.068,-.07], s: [.10,.09,.19] },
  { g: gem, c: '#ff602c', p: [.042,.015,.20], s: [.087,.096,.35], r: [.15,.21,0] },
  { g: gem, c: '#ffba33', p: [-.045,.03,.28], s: [.045,.05,.15] },
], 0).color
const poly = bake([
  { g: star, c: '#f563ed', s: [.36,.36,.52], r: [.38,0,0] },
  { g: star, c: '#fff3a9', s: [.22,.22,.52], r: [.38,0,.77] },
  ...Array.from({ length: 9 }, (_, i): Part => {
    const a = i * .59, r = .145 - i * .008, s = .067 - i * .004
    return { g: gem, c: i % 2 ? '#c189ff' : '#ff8edc', p: [Math.cos(a)*r,Math.sin(a)*r,.035*i], s: [s,s,s*1.5] }
  }),
], 0).color
const prayer = bake(Array.from({ length: 6 }, (_, i): Part => {
  const a = i * tau / 6
  return { g: star, c: i % 2 ? '#fff2ad' : '#b7ff9a', p: [.40*Math.cos(a),.13 + (i%2)*.13,.40*Math.sin(a)],
    s: [.095,.16,.11], r: [-.45,-a,0] }
}), 0).color
export const spellShapes = { light, fire, poly, prayer }

// A shared radial sprite gives the light orb a soft rim on an unlit mobile renderer.
const pixels = new Uint8Array(32 * 32 * 4)
for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
  const alpha = Math.max(0, 1 - Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5))
  pixels.set([255, 215, 108, Math.round(190 * alpha * alpha)], (y * 32 + x) * 4)
}
const glowMap = new DataTexture(pixels, 32, 32)
glowMap.magFilter = glowMap.minFilter = LinearFilter
glowMap.needsUpdate = true
export const lightHalo = new SpriteMaterial({ map: glowMap, transparent: true, depthWrite: false, toneMapped: false })

type Clock = { t: number }
type Bolt = 'light' | 'fire' | 'poly'
function Projectile({ kind, clock }: { kind: Bolt; clock?: Clock }) {
  const root = useRef<Group>(null)
  useFrame(state => {
    const t = clock?.t ?? state.clock.elapsedTime
    const mesh = root.current!
    if (kind === 'poly') mesh.rotation.z = t * 8
    if (kind === 'fire') mesh.scale.set(1 + .10*Math.sin(t*43), 1 + .11*Math.cos(t*37), 1 + .17*Math.sin(t*31))
    if (kind === 'light') mesh.scale.setScalar(1 + .045 * Math.sin(t*9))
  })
  return <group ref={root} dispose={null}>
    <mesh geometry={spellShapes[kind]} material={spellPaint} />
    {kind === 'light' && <sprite material={lightHalo} scale={.58} />}
  </group>
}
export function LightOrb() { return <Projectile kind="light" /> }
export function FireSpark() { return <Projectile kind="fire" /> }
export function PolyBolt() { return <Projectile kind="poly" /> }

const flameTongue = loft([[0,.031,.040],[.08,.088,.077],[.22,.044,.035,0,.036],
  [.36,.002,.002,0,.025]], 3)
const flame = bake([
  { g: flameTongue, c: '#ff6a29' },
  { g: flameTongue, c: '#ffc541', s: [.61,.62,.65], p: [-.018,.012,-.039], r: [0,0,.21] },
  { g: gem, c: '#fff0a0', s: [.053,.095,.056], p: [-.027,.061,-.065] },
], 0).color
const healStar = bake([{ g: star, c: '#fff09c', r: [-.55,0,0] }], 0).color
const poofStar = bake([{ g: star, c: '#ffe38a', r: [-.55,0,0] }], 0).color
const smoke = bake([
  { g: ball, c: '#ac6cde', s: [1,.87,.93] },
  { g: gem, c: '#d79af1', s: [.58,.52,.54], p: [-.17,.19,-.14] },
], 0).color
const healRing = new RingGeometry(.89, 1, 40).rotateX(-Math.PI / 2)

// The gallery supplies its pausable clock. Game callers supply time or normalized progress.
type Playhead = number | (() => number)
const sample = (v: Playhead) => typeof v === 'number' ? v : v()
const unit = (v: number) => Math.max(0, Math.min(1, v))

function useParticles() {
  const ref = useRef<InstancedMesh>(null)
  const pivot = useMemo(() => new Object3D(), [])
  return { ref, pivot }
}
function updateParticle(mesh: InstancedMesh, i: number, pivot: Object3D) {
  pivot.updateMatrix()
  mesh.setMatrixAt(i, pivot.matrix)
}
function initializeParticles(mesh: InstancedMesh) {
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
}

function Flames({ time, radius }: { time: Playhead; radius: number }) {
  const { ref, pivot } = useParticles()
  useFrame(() => {
    const mesh = ref.current!, t = sample(time)
    for (let i = 0; i < mesh.count; i++) {
      const a = i * tau / mesh.count + .11 * Math.sin(t*4 + i)
      const reach = radius * (.92 + .055 * Math.sin(t*7 + i))
      pivot.position.set(Math.cos(a)*reach, .045 + radius*.10, Math.sin(a)*reach)
      pivot.rotation.set(.13*Math.sin(a), -a, .13*Math.cos(t*12 + 3*i))
      const size = .70 + radius*.58
      pivot.scale.set(size, size*(.85 + .33*Math.sin(t*14 + 2*i)), size)
      updateParticle(mesh, i, pivot)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[flame, spellPaint, 6]} onUpdate={initializeParticles} frustumCulled={false} dispose={null} />
}
export function BurnFx(props: { time: number; radius: number }) { return <Flames {...props} /> }

function Healing({ progress, radius }: { progress: Playhead; radius: number }) {
  const { ref, pivot } = useParticles()
  const ring = useRef<Mesh>(null)
  // Each burst fades independently while overlapping another hero's prayer.
  const material = useRef<MeshBasicMaterial>(null)
  useFrame(() => {
    const p = unit(sample(progress)), mesh = ref.current!
    const envelope = Math.sin(Math.PI*p)
    ring.current!.visible = mesh.visible = p > 0 && p < 1
    ring.current!.scale.setScalar(radius * (.18 + .82 * (1 - (1-p)**2)))
    material.current!.opacity = .84 * Math.min(1, envelope*2.4)
    const sparkSize = .085 + .022 * radius
    for (let i = 0; i < mesh.count; i++) {
      const a = i*tau/mesh.count + p*.22, reach = radius * (.45 + .48*p) * (1 - (i%3)*.12)
      pivot.position.set(reach*Math.cos(a), .09 + p*(.44 + .12*(i%3) + .06*radius), reach*Math.sin(a))
      pivot.rotation.set(0, a*.5, .15*Math.sin(i+p*5))
      pivot.scale.setScalar(sparkSize * envelope * (.76 + .34 * Math.sin(i+p*13)))
      pivot.scale.y *= 1.72
      updateParticle(mesh, i, pivot)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  return <group>
    <mesh ref={ring} position-y={.035} geometry={healRing} renderOrder={2}>
      <meshBasicMaterial ref={material} color="#99f69a" transparent depthWrite={false} toneMapped={false} />
    </mesh>
    <instancedMesh ref={ref} args={[healStar, spellPaint, 10]} onUpdate={initializeParticles} frustumCulled={false} dispose={null} />
  </group>
}
export function HealFx(props: { progress: number; radius: number }) { return <Healing {...props} /> }

function Poof({ progress, scale = 1 }: { progress: Playhead; scale?: number }) {
  const { ref, pivot } = useParticles()
  const stars = useRef<InstancedMesh>(null)
  useFrame(() => {
    const p = unit(sample(progress)), clouds = ref.current!, glints = stars.current!
    clouds.visible = glints.visible = p > 0 && p < 1
    const travel = 1 - (1-p)**2
    for (let i = 0; i < clouds.count; i++) {
      const a = i * tau/clouds.count, reach = .09 + travel*.42
      pivot.position.set(Math.cos(a)*reach, .16 + .25*p + .075*(i%3), Math.sin(a)*reach)
      pivot.rotation.set(p+i, a+p, .3*i)
      pivot.scale.setScalar((.45 + .06*(i%3))*Math.sin(Math.PI*Math.sqrt(p)))
      updateParticle(clouds, i, pivot)
      pivot.position.multiplyScalar(1.37)
      pivot.position.y += .08 + p*.18
      pivot.rotation.set(-.44, a, a + p*1.8)
      pivot.scale.setScalar(.17 * Math.sin(Math.PI*p)**.75)
      updateParticle(glints, i, pivot)
    }
    clouds.instanceMatrix.needsUpdate = glints.instanceMatrix.needsUpdate = true
  })
  return <group scale={scale} dispose={null}>
    <instancedMesh ref={ref} args={[smoke, toon, 7]} onUpdate={initializeParticles} frustumCulled={false} />
    <instancedMesh ref={stars} args={[poofStar, spellPaint, 7]} onUpdate={initializeParticles} frustumCulled={false} />
  </group>
}
export function PoofFx(props: { progress: number; scale?: number }) { return <Poof {...props} /> }

// Paint a billow once. Overlapping soft-edged lobes hide the host during the burst.
function cloudTexture() {
  const size = 64, pixels = new Uint8Array(size*size*4)
  const lobes = [[-.43,-.08,.43],[-.24,.26,.43],[.13,.32,.46],[.43,-.01,.39],[.14,-.27,.45],[-.23,-.30,.38]]
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = 2*(x+.5)/size-1, v = 2*(y+.5)/size-1
    let density = -1, light = 0
    for (const [cx,cy,r] of lobes) {
      const d = r-Math.hypot(u-cx,v-cy)
      density = Math.max(density,d)
      light = Math.max(light, unit(d/.13)*unit(.45+.75*(v-cy)/r-.42*(u-cx)/r))
    }
    pixels.set([83+69*light,35+39*light,112+64*light,232*unit(.5+density/.18)],4*(y*size+x))
  }
  const map = new DataTexture(pixels,size,size)
  map.colorSpace = SRGBColorSpace
  map.minFilter = map.magFilter = LinearFilter
  map.needsUpdate = true
  return map
}
const smokeBank = new PlaneGeometry(1,1)
const vapor = new MeshBasicMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, toneMapped: false })
// The pinched ends and the bent spine stay legible above the round smoke banks.
const wisp = bake([{ g: loft([[0,.013,.017],[.17,.104,.060,0,.09],[.38,.099,.082,.04,.11],
  [.61,.063,.049,.10,-.085],[.81,.028,.033,.09,-.23],[.95,.004,.007,0,-.20]],6), c: '#49235e' }],0).color
function Possession({ progress, scale = 1 }: { progress: Playhead; scale?: number }) {
  const { ref, pivot } = useParticles()
  const trails = useRef<InstancedMesh>(null)
  const facing = useMemo(() => new Quaternion(), [])
  useFrame(({camera}) => {
    const p = unit(sample(progress)), clouds = ref.current!, curls = trails.current!
    clouds.visible = curls.visible = p > 0 && p < 1
    if (!clouds.visible) return
    clouds.getWorldQuaternion(facing).invert().multiply(camera.quaternion)
    for (let i = 0; i < clouds.count; i++) {
      const level = i%3
      const life = unit((p-level*.055)/(1-level*.055))
      const burst = 1-(1-life)**3
      const a = i*2.4 + life*(1.47+.24*level)
      const radius = (.15+.71*burst) * (1-.16*level)
      const y = .27 + level*.29 + life*(.88+.19*level)
      const size = (.85+.12*level)*Math.sin(Math.PI*Math.sqrt(life))
      pivot.position.set(Math.cos(a)*radius,y,Math.sin(a)*radius)
      pivot.quaternion.copy(facing)
      pivot.rotateZ(.34*Math.sin(a)+.25*life)
      pivot.scale.set(size*1.54,size*(1.21+.23*life),1)
      updateParticle(clouds,i,pivot)
      pivot.position.set(Math.cos(a+.38)*radius*1.32,y-.22,Math.sin(a+.38)*radius*1.32)
      pivot.rotation.set(.22,a+.76,.32*Math.sin(a))
      pivot.scale.set(size,size*(1.06+.57*life),size)
      updateParticle(curls,i,pivot)
    }
    clouds.instanceMatrix.needsUpdate = curls.instanceMatrix.needsUpdate = true
  })
  return <group scale={scale} dispose={null}>
    <instancedMesh ref={ref} args={[smokeBank,vapor,12]} onUpdate={initializeParticles} frustumCulled={false} />
    <instancedMesh ref={trails} args={[wisp,toon,12]} onUpdate={initializeParticles} frustumCulled={false} />
  </group>
}
export function PossessSmoke(props: { progress: number; scale?: number }) { return <Possession {...props} /> }

const floorRing = (inner: number, outer: number, segments: number, arc = tau) =>
  new RingGeometry(inner,outer,segments,1,0,arc).rotateX(-Math.PI/2)
const runeArc = floorRing(.84,.91,8,tau/6-.19)
const rune = fold([[0,.5],[.40,0],[0,-.5],[-.40,0]],.05)
const circle = bake([
  { g: floorRing(.968,1,48), c: '#d5a1ff' },
  { g: floorRing(.61,.64,36), c: '#da74ff' },
  { g: floorRing(.553,.60,3), c: '#c265ff' },
  { g: floorRing(.553,.60,3), c: '#f3b6ff', r: [0,Math.PI/3,0] },
  ...Array.from({ length: 6 }, (_,i): Part[] => {
    const a = i*tau/6
    return [
      { g: runeArc, c: '#ac47f7', r: [0,a+.09,0] },
      { g: rune, c: '#ffd8ff', p: [.78*Math.cos(a),.004,-.78*Math.sin(a)], s: [.108,.36,.1], r: [-Math.PI/2,0,a-Math.PI/2] },
    ]
  }).flat(),
],0).color
const flashDisc = new CircleGeometry(1,48).rotateX(-Math.PI/2)
function Summoning({ progress }: { progress: Playhead }) {
  const ring = useRef<Mesh>(null), flash = useRef<Mesh>(null)
  const lines = useRef<MeshBasicMaterial>(null), wash = useRef<MeshBasicMaterial>(null)
  useFrame(() => {
    const p = unit(sample(progress)), open = 1-(1-p)**4
    const pulse = ramp(p,.32,.48)*(1-ramp(p,.48,.76))
    ring.current!.visible = flash.current!.visible = p > 0 && p < 1
    ring.current!.scale.setScalar(.64*(.12+.88*open))
    ring.current!.rotation.y = .76*open+.23*p
    lines.current!.opacity = ramp(p,0,.11)*(1-ramp(p,.69,1))
    flash.current!.scale.setScalar(.62*open)
    wash.current!.opacity = .51*pulse
  })
  return <group>
    <mesh ref={ring} geometry={circle} position-y={.039} renderOrder={3}>
      <meshBasicMaterial ref={lines} vertexColors transparent depthWrite={false} toneMapped={false} />
    </mesh>
    <mesh ref={flash} geometry={flashDisc} position-y={.035} renderOrder={2}>
      <meshBasicMaterial ref={wash} color="#e7acff" transparent depthWrite={false} toneMapped={false} />
    </mesh>
  </group>
}
export function SummonFx(props: { progress: number }) { return <Summoning {...props} /> }

const heart = fold([[0,.23],[.16,.43],[.34,.46],[.49,.29],[.50,.10],[.39,-.12],[0,-.50],
  [-.39,-.12],[-.50,.10],[-.49,.29],[-.34,.46],[-.16,.43]],.13)
const potionHeart = bake([
  { g: heart, c: '#ff4678' },
  { g: star, c: '#fff3df', p: [-.24,.26,.115], s: [.19,.23,.15] },
  { g: star, c: '#ffacca', p: [.69,-.27,.012], s: [.26,.40,.30] },
],0).color
const blushRing = bake([
  { g: floorRing(.75,.84,40), c: '#ff557a' }, { g: floorRing(.84,.89,40), c: '#ffd4d5' },
  { g: floorRing(.95,1,40), c: '#fc7399' },
],0).color
function Potion({ progress }: { progress: Playhead }) {
  const { ref, pivot } = useParticles()
  const ring = useRef<Mesh>(null), blush = useRef<MeshBasicMaterial>(null)
  const facing = useMemo(() => new Quaternion(), [])
  useFrame(({camera}) => {
    const p = unit(sample(progress)), hearts = ref.current!
    hearts.visible = ring.current!.visible = p > 0 && p < 1
    if (!hearts.visible) return
    ring.current!.scale.setScalar(.20+.34*(1-(1-p)**3))
    blush.current!.opacity = ramp(p,0,.10)*(1-ramp(p,.32,.82))
    hearts.getWorldQuaternion(facing).invert().multiply(camera.quaternion)
    for (let i = 0; i < hearts.count; i++) {
      const delay = (i%3)*.085, life = unit((p-delay)/(1-delay))
      const a = i*tau/hearts.count+.48*life
      const radius = .32+.12*life
      pivot.position.set(radius*Math.cos(a),.19+life*(.83+.14*(i%3)),radius*Math.sin(a))
      pivot.quaternion.copy(facing)
      pivot.rotateZ(.13*Math.sin(i+life*5))
      pivot.scale.setScalar((.16+.035*(i%2))*ramp(life,0,.19)*(1-ramp(life,.65,1)))
      updateParticle(hearts,i,pivot)
    }
    hearts.instanceMatrix.needsUpdate = true
  })
  return <group>
    <mesh ref={ring} geometry={blushRing} position-y={.037} renderOrder={2}>
      <meshBasicMaterial ref={blush} vertexColors transparent depthWrite={false} toneMapped={false} />
    </mesh>
    <instancedMesh ref={ref} args={[potionHeart,spellPaint,6]} onUpdate={initializeParticles} frustumCulled={false} dispose={null} />
  </group>
}
export function PotionFx(props: { progress: number }) { return <Potion {...props} /> }

export type MagicExhibit = 'Light orb' | 'Fire spark' | 'Poly bolt' | 'Burn' | 'Heal' | 'Poof' |
  'Possess smoke' | 'Summon' | 'Potion'
export function PreviewMagic({ name, clock }: { name: MagicExhibit; clock: Clock }) {
  const phase = () => (clock.t * .72 + .16) % 1
  switch (name) {
    case 'Light orb': return <Projectile kind="light" clock={clock} />
    case 'Fire spark': return <Projectile kind="fire" clock={clock} />
    case 'Poly bolt': return <Projectile kind="poly" clock={clock} />
    case 'Burn': return <Flames time={() => clock.t} radius={.37} />
    case 'Heal': return <Healing progress={phase} radius={.64} />
    case 'Poof': return <Poof progress={phase} />
    case 'Possess smoke': return <Possession progress={() => (clock.t % 1.55)/1.2} />
    case 'Summon': return <Summoning progress={() => (clock.t % 1.25)/.8} />
    case 'Potion': return <Potion progress={() => (clock.t % 1.35)/.9} />
  }
}
