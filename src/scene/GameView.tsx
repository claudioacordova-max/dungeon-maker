import { Canvas } from '@react-three/fiber'
import World from './World'

// The 3D game (Three.js, models, world). Loaded as its own chunk, only when a match starts (App.tsx).
export default function GameView() {
  return (
    // dpr capped at 2: phones report 3, which triples the pixels drawn for no visible gain here.
    <Canvas className="game-canvas" dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }} camera={{ fov: 42, near: 0.5, far: 200, position: [5, 20, 10] }}>
      <color attach="background" args={['#1b1033']} />
      <World />
    </Canvas>
  )
}
