import { Canvas } from '@react-three/fiber'
import { useEffect } from 'react'
import { startInput } from './game/input'
import { isMobileTarget } from './game/target'
import RoomScene from './scene/RoomScene'
import GameUi from './ui/GameUi'
import './ui/game.css'

// Game shell: canvas with the UI overlay on top. Mobile targets: a stage with a fixed short axis and a flexible
// long axis (shell.css). The room is drawn top-down with an orthographic camera (RoomScene).
export default function App() {
  useEffect(startInput, [])

  const game = (
    <div className="game">
      <Canvas className="game-canvas" orthographic camera={{ position: [0, 30, 0], zoom: 30 }}>
        <color attach="background" args={['#0b1120']} />
        <RoomScene />
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
