// ?photos: takes the menu portraits from the high-detail menu models (src/models/hd/), on a transparent
// background, and leaves them in window.__photos as PNG data URLs. A capture script saves them as
// public/ui/photo-*.webp; the game itself never loads this file.
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { MenuPose } from '../models/hd/menuPose'
import { FRAMING, HdModel, Lights, PARTY, type PortraitWho } from './LivePortrait'

const photos: Record<string, string> = {}
declare global {
  interface Window {
    __photos?: Record<string, string>
  }
}

// A still from the idle loop (`t` seconds in), chosen for a good pose.
const STILL_T = 0.6

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

function Still({ who, t = STILL_T }: { who: Exclude<PortraitWho, 'party'>; t?: number }) {
  const pose = useMemo<MenuPose>(() => ({ anim: 'idle', t }), [t])
  return <HdModel who={who} pose={pose} />
}

const SHOTS: { name: PortraitWho; w: number; h: number }[] = [
  { name: 'melee', w: 400, h: 480 },
  { name: 'ranged', w: 400, h: 480 },
  { name: 'priest', w: 400, h: 480 },
  { name: 'mage', w: 400, h: 480 },
  { name: 'master', w: 400, h: 480 },
  { name: 'party', w: 640, h: 400 },
]

export default function PhotoStudio() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8, background: '#2a1d45' }}>
      {SHOTS.map((shot) => {
        const f = FRAMING[shot.name]
        return (
          <div key={shot.name} style={{ width: shot.w, height: shot.h, background: '#3b2a5e' }}>
            <Canvas
              dpr={2}
              gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
              camera={{ fov: f.fov, position: f.camera }}
              onCreated={({ camera }) => camera.lookAt(...f.look)}
              style={{ width: shot.w, height: shot.h }}
            >
              <Lights />
              {shot.name === 'party' ? (
                PARTY.map((p) => (
                  <group key={p.who} position={p.at} rotation={[0, p.yaw, 0]}>
                    <Still who={p.who} t={STILL_T + p.delay} />
                  </group>
                ))
              ) : (
                <group rotation={[0, -0.3, 0]}>
                  <Still who={shot.name} />
                </group>
              )}
              <Capture name={shot.name} total={SHOTS.length} />
            </Canvas>
          </div>
        )
      })}
    </div>
  )
}
