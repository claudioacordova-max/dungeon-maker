import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry, DataTexture, DynamicDrawUsage, Float32BufferAttribute, Group,
  InstancedMesh, LinearFilter, MeshBasicMaterial, Object3D, RingGeometry, SpriteMaterial,
  type Mesh,
} from 'three'
import { bake, ball, gem, toon, type Part } from './kit'
import { loft } from './Enemies'

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

export type MagicExhibit = 'Light orb' | 'Fire spark' | 'Poly bolt' | 'Burn' | 'Heal' | 'Poof'
export function PreviewMagic({ name, clock }: { name: MagicExhibit; clock: Clock }) {
  const phase = () => (clock.t * .72 + .16) % 1
  switch (name) {
    case 'Light orb': return <Projectile kind="light" clock={clock} />
    case 'Fire spark': return <Projectile kind="fire" clock={clock} />
    case 'Poly bolt': return <Projectile kind="poly" clock={clock} />
    case 'Burn': return <Flames time={() => clock.t} radius={.37} />
    case 'Heal': return <Healing progress={phase} radius={.64} />
    case 'Poof': return <Poof progress={phase} />
  }
}
