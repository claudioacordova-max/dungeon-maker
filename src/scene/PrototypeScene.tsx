import { useFrame } from '@react-three/fiber'
import { useGame } from '../game/store'

// Placeholder scene: replace with the game's world. Click or tap the cube while playing to test pointer/touch input.
export default function PrototypeScene() {
  const tick = useGame((s) => s.tick)
  const hit = useGame((s) => s.hit)

  useFrame((_, delta) => tick(delta))

  return (
    <>
      <mesh position={[0, 0.65, 0]} onClick={hit}>
        <boxGeometry args={[1.3, 1.3, 1.3]} />
        <meshStandardMaterial color="#6ee7b7" roughness={0.45} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#263449" roughness={0.9} />
      </mesh>
    </>
  )
}
