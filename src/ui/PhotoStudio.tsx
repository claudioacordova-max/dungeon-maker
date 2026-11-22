// ?photos: takes the menu portraits from the real 3D models (heroes, the Maestro, the party together), on a
// transparent background, and leaves them in window.__photos as PNG data URLs. A capture script saves them as
// public/ui/photo-*.webp; the game itself never loads this file.
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import { MageHero, MeleeHero, PriestHero, RangedHero, makePose } from '../models'
import { MasterLord } from '../models/Master'

type Shot = { name: string; w: number; h: number; camera: [number, number, number]; look: [number, number, number]; fov: number; children: ReactNode }

const photos: Record<string, string> = {}
declare global {
  interface Window {
    __photos?: Record<string, string>
  }
}

function Capture({ name, total }: { name: string; total: number }) {
  const gl = useThree((s) => s.gl)
  const frames = useRef(0)
  useFrame(() => {
    frames.current += 1
    if (frames.current !== 10) return
    photos[name] = gl.domElement.toDataURL('image/png')
    if (Object.keys(photos).length === total) window.__photos = { ...photos }
  })
  return null
}

function Posed({ model, tint, at = [0, 0, 0], yaw = 0 }: { model: 'melee' | 'ranged' | 'priest' | 'mage' | 'master'; tint: string; at?: [number, number, number]; yaw?: number }) {
  const pose = useMemo(() => {
    const p = makePose()
    p.t = 0.35
    return p
  }, [])
  const body =
    model === 'melee' ? <MeleeHero pose={pose} tint={tint} />
    : model === 'ranged' ? <RangedHero pose={pose} tint={tint} />
    : model === 'priest' ? <PriestHero pose={pose} tint={tint} />
    : model === 'mage' ? <MageHero pose={pose} tint={tint} />
    : <MasterLord pose={pose} />
  return (
    <group position={at} rotation={[0, Math.PI + yaw, 0]}>
      {body}
    </group>
  )
}

const TINT = '#38bdf8'
const single = (name: string, model: 'melee' | 'ranged' | 'priest' | 'mage' | 'master', height = 0.62): Shot => ({
  name,
  w: 400,
  h: 480,
  fov: 22,
  camera: [1.1, height + 1.0, 3.6],
  look: [0, height, 0],
  children: <Posed model={model} tint={TINT} yaw={-0.35} />,
})

const SHOTS: Shot[] = [
  single('melee', 'melee'),
  single('ranged', 'ranged'),
  single('priest', 'priest'),
  single('mage', 'mage'),
  { ...single('master', 'master', 0.95), camera: [1.4, 2.1, 4.8] },
  {
    name: 'party',
    w: 640,
    h: 400,
    fov: 24,
    camera: [0, 1.9, 5.6],
    look: [0, 0.55, 0],
    children: (
      <>
        <Posed model="priest" tint={TINT} at={[-1.25, 0, -0.5]} yaw={0.45} />
        <Posed model="mage" tint={TINT} at={[1.25, 0, -0.5]} yaw={-0.45} />
        <Posed model="ranged" tint={TINT} at={[-0.48, 0, 0.25]} yaw={0.2} />
        <Posed model="melee" tint={TINT} at={[0.48, 0, 0.3]} yaw={-0.2} />
      </>
    ),
  },
]

export default function PhotoStudio() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8, background: '#2a1d45' }}>
      {SHOTS.map((shot) => (
        <div key={shot.name} style={{ width: shot.w, height: shot.h, background: '#3b2a5e' }}>
          <Canvas
            dpr={2}
            gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
            camera={{ fov: shot.fov, position: shot.camera }}
            onCreated={({ camera }) => camera.lookAt(...shot.look)}
            style={{ width: shot.w, height: shot.h }}
          >
            <ambientLight intensity={1.15} />
            <directionalLight position={[4, 9, 6]} intensity={1.9} />
            <directionalLight position={[-5, 3, -4]} intensity={0.6} color="#c4b5fd" />
            {shot.children}
            <Capture name={shot.name} total={SHOTS.length} />
          </Canvas>
        </div>
      ))}
    </div>
  )
}
