// A live, animated view of a high-detail menu model (src/models/hd/) for the selected card: its idle loop, and a
// cheer each time `cheer` changes (a new pick). Loaded lazily, so the menus stay free of three.js until it arrives;
// the card shows the still photo meanwhile. `PORTRAIT_MODELS` is shared with the photo studio (?photos).
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, type ReactNode } from 'react'
import { HdMaestro, HdMage, HdPriestess } from '../models/hd/HdCasters'
import { HdArcher, HdSwordsman } from '../models/hd/HdFighters'
import type { MenuPose } from '../models/hd/menuPose'
import type { HeroClass } from '../shared/protocol'

export type PortraitWho = HeroClass | 'master' | 'party'
const CHEER_SECONDS = 1.6

export function HdModel({ who, pose }: { who: Exclude<PortraitWho, 'party'>; pose: MenuPose }) {
  if (who === 'melee') return <HdSwordsman pose={pose} />
  if (who === 'ranged') return <HdArcher pose={pose} />
  if (who === 'priest') return <HdPriestess pose={pose} />
  if (who === 'mage') return <HdMage pose={pose} />
  return <HdMaestro pose={pose} />
}

// Camera and placement per subject (shared with the photo studio).
export const FRAMING: Record<PortraitWho, { camera: [number, number, number]; look: [number, number, number]; fov: number }> = {
  melee: { camera: [0.9, 1.45, 3.6], look: [0, 0.68, 0], fov: 22 },
  ranged: { camera: [0.9, 1.45, 3.6], look: [0, 0.68, 0], fov: 22 },
  priest: { camera: [0.9, 1.45, 3.6], look: [0, 0.68, 0], fov: 22 },
  mage: { camera: [0.9, 1.45, 3.6], look: [0, 0.7, 0], fov: 22 },
  master: { camera: [1.1, 1.75, 4.4], look: [0, 0.85, 0], fov: 22 },
  party: { camera: [0, 1.55, 5.2], look: [0, 0.62, 0], fov: 24 },
}

// The party together: positions and turns, back row first.
export const PARTY: { who: HeroClass; at: [number, number, number]; yaw: number; delay: number }[] = [
  { who: 'priest', at: [-1.2, 0, -0.45], yaw: 0.35, delay: 0.7 },
  { who: 'mage', at: [1.2, 0, -0.45], yaw: -0.35, delay: 1.9 },
  { who: 'ranged', at: [-0.45, 0, 0.3], yaw: 0.15, delay: 0 },
  { who: 'melee', at: [0.45, 0, 0.35], yaw: -0.15, delay: 1.2 },
]

export function Lights() {
  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[4, 9, 6]} intensity={1.9} />
      <directionalLight position={[-5, 3, -4]} intensity={0.6} color="#c4b5fd" />
    </>
  )
}

function Animated({ who, cheer, delay = 0 }: { who: Exclude<PortraitWho, 'party'>; cheer: number; delay?: number }) {
  const pose = useMemo<MenuPose>(() => ({ anim: 'idle', t: delay }), [delay])
  useEffect(() => {
    if (cheer > 0) {
      pose.anim = 'cheer'
      pose.t = 0
    }
  }, [cheer, pose])
  useFrame((_, dt) => {
    pose.t += Math.min(dt, 0.1)
    if (pose.anim === 'cheer' && pose.t >= CHEER_SECONDS) {
      pose.anim = 'idle'
      pose.t = 0
    }
  })
  return <HdModel who={who} pose={pose} />
}

export default function LivePortrait({ who, cheer = 0, className }: { who: PortraitWho; cheer?: number; className?: string }) {
  const f = FRAMING[who]
  let body: ReactNode
  if (who === 'party') {
    body = PARTY.map((p) => (
      <group key={p.who} position={p.at} rotation={[0, p.yaw, 0]}>
        <Animated who={p.who} cheer={cheer} delay={p.delay} />
      </group>
    ))
  } else {
    body = (
      <group rotation={[0, -0.3, 0]}>
        <Animated who={who} cheer={cheer} />
      </group>
    )
  }
  return (
    <span className={className} style={{ display: 'block' }}>
    <Canvas
      style={{ pointerEvents: 'none' }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ fov: f.fov, position: f.camera }}
      onCreated={({ camera }) => camera.lookAt(...f.look)}
    >
      <Lights />
      {body}
    </Canvas>
    </span>
  )
}
