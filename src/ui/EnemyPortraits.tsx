// Renders the placeable enemies once, side by side, in a small hidden canvas with the game's lights and a 3/4 view,
// and keeps each one as an image for the Maestro's enemy list (see portraits.ts). Then it unmounts.
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { makePose, Ogre, Slime, Thrower } from '../models'
import type { Placeable } from '../shared/protocol'
import { usePortraits } from './portraits'

const CELL = 160 // css px per portrait
const KINDS: Placeable[] = ['slime', 'thrower', 'ogre']
// Each model is scaled to read at the same size in its square.
const SCALE: Record<Placeable, number> = { slime: 1.7, thrower: 1.05, ogre: 0.78 }

function Capture() {
  const gl = useThree((s) => s.gl)
  const frames = useRef(0)
  useFrame(() => {
    frames.current += 1
    if (frames.current !== 8) return
    const src = gl.domElement
    const cw = src.width / KINDS.length
    const urls: Partial<Record<Placeable, string>> = {}
    KINDS.forEach((kind, i) => {
      const c = document.createElement('canvas')
      c.width = cw
      c.height = src.height
      c.getContext('2d')?.drawImage(src, i * cw, 0, cw, src.height, 0, 0, cw, src.height)
      urls[kind] = c.toDataURL('image/png')
    })
    usePortraits.setState({ urls, done: true })
  })
  return null
}

function Model({ kind }: { kind: Placeable }) {
  const pose = useMemo(() => {
    const p = makePose()
    p.t = 0.35
    return p
  }, [])
  if (kind === 'slime') return <Slime pose={pose} />
  if (kind === 'thrower') return <Thrower pose={pose} />
  return <Ogre pose={pose} />
}

export default function EnemyPortraits() {
  return (
    <div style={{ position: 'fixed', left: -10000, top: 0, width: CELL * KINDS.length, height: CELL, pointerEvents: 'none' }} aria-hidden="true">
      <Canvas
        dpr={2}
        gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
        camera={{ fov: 22, position: [0, 2.6, 7.6] }}
        onCreated={({ camera }) => camera.lookAt(0, 0.7, 0)}
      >
        <ambientLight intensity={1.15} />
        <directionalLight position={[6, 14, 4]} intensity={1.8} />
        {KINDS.map((kind, i) => (
          <group key={kind} position={[(i - 1) * 3, 0, 0]} rotation={[0, -0.45, 0]} scale={SCALE[kind]}>
            <Model kind={kind} />
          </group>
        ))}
        <Capture />
      </Canvas>
    </div>
  )
}
