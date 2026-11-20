import { Canvas } from '@react-three/fiber'
import { useEffect } from 'react'
import { startInput } from './game/input'
import { isMobileTarget } from './game/target'
import World from './scene/World'
import GameUi from './ui/GameUi'
import Showcase from './models/Showcase'

// Game shell: canvas with the UI overlay on top. Mobile targets: a stage with a fixed short axis and a flexible
// long axis (shell.css). The world is drawn with a tilted perspective camera (scene/World.tsx).
// ?models shows every 3D model and its animations (art review), instead of the game.
const SHOWCASE = new URLSearchParams(location.search).has('models')

export default function App() {
  useEffect(startInput, [])
  if (SHOWCASE) return <Showcase />

  const game = (
    <div className="game">
      {/* dpr capped at 2: phones report 3, which triples the pixels drawn for no visible gain here. */}
      <Canvas className="game-canvas" dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }} camera={{ fov: 42, near: 0.5, far: 200, position: [5, 20, 10] }}>
        <color attach="background" args={['#1b1033']} />
        <World />
      </Canvas>
      <GameUi />
    </div>
  )

  return isMobileTarget ? (
    <div className="stage-host">
      <div className="stage">{game}</div>
      {/* The game keeps running behind this hint (multiplayer: it cannot pause). */}
      <div className="rotate-hint" role="alert">
        Gira el dispositivo
      </div>
    </div>
  ) : (
    game
  )
}
