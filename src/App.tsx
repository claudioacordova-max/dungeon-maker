import { KeyboardControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { keyMap, onControlChange } from './game/input'
import { isMobileTarget } from './game/target'
import PrototypeScene from './scene/PrototypeScene'
import GameUi from './ui/GameUi'

// Game shell: canvas with the UI overlay on top. Extend it; do not wrap it in a page layout.
// Desktop: the game fills the viewport. Mobile targets: it fills a stage with a fixed short axis and a flexible long axis (shell.css).
export default function App() {
  const game = (
    <div className="game">
      <Canvas className="game-canvas" camera={{ position: [3.5, 2.8, 4.5], fov: 45 }}>
        <color attach="background" args={['#111827']} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 6, 3]} intensity={2} />
        <PrototypeScene />
      </Canvas>
      <GameUi />
    </div>
  )

  return (
    <KeyboardControls map={keyMap} onChange={onControlChange}>
      {isMobileTarget ? (
        <div className="stage-host">
          <div className="stage">{game}</div>
          {/* Play continues behind this hint; a real-time game should pause when it shows. */}
          <div className="rotate-hint" role="alert">
            Gira el dispositivo
          </div>
        </div>
      ) : (
        game
      )}
    </KeyboardControls>
  )
}
