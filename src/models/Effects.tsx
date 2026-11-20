import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group,
  InstancedBufferAttribute, MeshBasicMaterial, ShaderMaterial, Sphere, TorusGeometry, Vector3,
} from 'three'
import { bake, ball, barrel, box, cone, gem, toon, type Part } from './kit'

// A single fan with a soft edge anchors feet, including in bright rooms.
const shadowDisk = new BufferGeometry()
const shadowVertices = [0, 0, 0], shadowIndices: number[] = []
for (let j = 0; j < 20; j++) {
  const a = -j * Math.PI / 10
  shadowVertices.push(Math.cos(a), 0, Math.sin(a))
  shadowIndices.push(0, j + 1, (j + 1) % 20 + 1)
}
shadowDisk.setAttribute('position', new Float32BufferAttribute(shadowVertices, 3))
shadowDisk.setIndex(shadowIndices)
const shadowInk = new ShaderMaterial({
  transparent: true, depthWrite: false,
  vertexShader: `varying vec2 pt; void main() { pt = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `varying vec2 pt; void main() {
    gl_FragColor = vec4(.024, .012, .038, .38 * (1. - smoothstep(.47, 1., length(pt))));
    #include <colorspace_fragment>
  }`,
})

export function BlobShadow({ radius }: { radius: number }) {
  return <mesh geometry={shadowDisk} material={shadowInk} scale={[radius, 1, radius * .88]}
    position-y={.009} renderOrder={1} dispose={null} />
}

function arrow(crit: boolean) {
  const gold = crit ? '#fff095' : '#a4fbeb'
  const parts: Part[] = [
    { g: barrel, c: '#552d4e', s: [.05, .63, .05], r: [Math.PI / 2, 0, 0] },
    { g: cone, c: gold, p: [0, 0, -.28], s: [.20, .31, .11], r: [-Math.PI / 2, 0, 0] },
    { g: barrel, c: '#ffc650', p: [0, 0, -.13], s: [.076, .06, .076], r: [Math.PI / 2, 0, 0] },
  ]
  for (const side of [-1, 1]) {
    parts.push({ g: box, c: crit ? '#ff9a34' : '#22c8b4', s: [.058, .036, .17],
      p: [side * .047, .006, .24], r: [0, side * .46, 0] })
  }
  return bake(parts, 0).color
}
const bolt = arrow(false), critBolt = arrow(true)
const glowPaint = new MeshBasicMaterial({ vertexColors: true })
const critHalo = new MeshBasicMaterial({ color: '#ffba3c', transparent: true, opacity: .32, depthWrite: false, toneMapped: false })
const boltWake = bake([
  { g: cone, c: '#ffffff', p: [0, 0, -.263], s: [.255, .39, .15], r: [-Math.PI / 2, 0, 0] },
  { g: gem, c: '#ffffff', p: [0, 0, .32], s: [.073, .055, .31] },
  { g: gem, c: '#ffffff', p: [.064, .008, .35], s: [.031, .035, .17] },
], 0).color

export function HeroBolt({ crit }: { crit: boolean }) {
  return <group scale={crit ? 1.36 : 1} dispose={null}>
    <mesh geometry={crit ? critBolt : bolt} material={crit ? glowPaint : toon} />
    {crit && <mesh geometry={boltWake} material={critHalo} />}
  </group>
}

const orbCore = bake([{ g: ball, c: '#922ee5', s: [.36, .36, .36] }], 0).color
const orbShape = bake([
  { g: gem, c: '#d9ffa3', s: [.16, .20, .08], p: [.005, .086, .12], r: [-.48, .2, -.22] },
  { g: gem, c: '#fcfbc1', s: [.075, .09, .06], p: [-.095, .104, -.045] },
  { g: new TorusGeometry(.185, .022, 4, 12), c: '#c0ff80', r: [1.15, .15, -.39] },
], 0).color
const orbAura = new MeshBasicMaterial({ color: '#b97bff', transparent: true, opacity: .13, depthWrite: false })

export function EnemyOrb() {
  return <group dispose={null}>
    <mesh geometry={orbCore} material={toon} />
    <mesh geometry={orbShape} material={glowPaint} />
    <mesh geometry={ball} material={orbAura} scale={.45} />
  </group>
}

// Each ribbon vertex stores distance along the stroke and distance from the
// centre. The instance data sets the arc and playhead without rebuilding it.
function ribbon() {
  const pos: number[] = [], indices: number[] = [], colors: number[] = []
  const steps = 56
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    pos.push(u, .83, 0, u, .94, 0, u, 1, 0)
    colors.push(.02,.7,.58, .56,1,.78, 1,1,.94)
    if (i < steps) {
      const a = i * 3
      indices.push(a,a+1,a+4, a,a+4,a+3, a+1,a+2,a+5, a+1,a+5,a+4)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  g.setIndex(indices)
  g.boundingSphere = new Sphere(new Vector3(), 1.05)
  return g
}
const trail = ribbon()
const trailPaint = new ShaderMaterial({
  vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, forceSinglePass: true,
  vertexShader: `
    varying vec3 ink;
    varying float opacity;
    void main() {
      float arc = instanceColor.x, t = instanceColor.y, ring = instanceColor.z;
      float u = position.x;
      float front = min(1., .12 + t * 2.75);
      float back = smoothstep(.50, 1., t) * .96;
      float angle = (mix(back, front, u) - .5) * arc;
      float width = (.18 + .82 * sin(3.14159 * pow(u, 1.35)));
      float r = 1. - (1. - position.y) * width;
      vec3 p = vec3(sin(angle) * r, .034 + .014 * u, -cos(angle) * r);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      ink = mix(color, vec3(1., .42 + .58 * color.r, .085 + color.r * .8), ring);
      opacity = smoothstep(0., .07, t) * (1. - smoothstep(.59, 1., t));
    }`,
  fragmentShader: `
    varying vec3 ink;
    varying float opacity;
    void main() {
      gl_FragColor = vec4(ink, opacity);
      #include <colorspace_fragment>
    }`,
})

type SweepProps = { progress: number; radius: number; arc: number; spin?: boolean }

function strokeData(arc: number, t: number, spin: boolean) {
  return new InstancedBufferAttribute(new Float32Array([arc, t, Number(spin)]), 3)
    .setUsage(DynamicDrawUsage)
}

function Stroke({ data, radius }: { data: InstancedBufferAttribute; radius: number }) {
  return <instancedMesh args={[trail, trailPaint, 1]} instanceColor={data}
    scale={[radius, 1, radius]} renderOrder={2} />
}

function Sweep({ progress, radius, arc, spin = false }: SweepProps) {
  const data = useMemo(() => strokeData(0, 0, false), [])
  useFrame(() => {
    if (Math.abs(data.getX(0) - arc) + Math.abs(data.getY(0) - progress) > .00001 || data.getZ(0) !== Number(spin)) {
      data.setXYZ(0, arc, progress, Number(spin))
      data.needsUpdate = true
    }
  })
  return <Stroke data={data} radius={radius} />
}

export function SlashFx(props: { progress: number; radius: number; arc: number }) {
  return <Sweep {...props} />
}
export function SpinFx(props: { progress: number; radius: number }) {
  return <Sweep {...props} arc={Math.PI * 2} spin />
}

// The gallery drives the same strokes directly from its shared playhead.
export function PreviewStroke({ time, spin = false }: { time: { t: number }; spin?: boolean }) {
  const data = useMemo(() => strokeData(spin ? Math.PI * 2 : 2.45, 0, spin), [spin])
  const pivot = useRef<Group>(null)
  useFrame(() => {
    const phase = (time.t * .77 + .22) % 1
    data.setY(0, phase)
    data.needsUpdate = true
    if (pivot.current) pivot.current.rotation.y = spin ? phase * 2 : 0
  })
  return <group ref={pivot}><Stroke data={data} radius={spin ? .57 : .64} /></group>
}

