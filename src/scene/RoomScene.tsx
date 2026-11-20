import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import type { Group, Mesh, MeshStandardMaterial, OrthographicCamera } from 'three'
import { feedback, frame as heroFrame, local, resetHero, visibleStrikes } from '../game/hero'
import { useMaster } from '../game/master'
import { me, SHOW_GHOSTS, useNet } from '../net/connection'
import { latestEnemy, latestHero, sampleEnemy, sampleHero } from '../net/interp'
import type { Placeable } from '../shared/protocol'
import { ENEMY_HP, ROOM_H, ROOM_W } from '../shared/rules'
import { isPlaceable } from '../shared/sim'
import { PLAYER_COLORS } from '../ui/screens'

// Top-down room. Simulation (x, y) maps to world (x, 0, -y): the door (y = ROOM_H) is at the top of the screen.
const TOP_RESERVE = 64 // design px kept for the top HUD
const BOTTOM_RESERVE = 190 // design px kept for joystick / palette and party list

function FitCamera() {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    const cam = camera as OrthographicCamera
    const designPx = size.width / 390 // the mobile stage is 390 design px wide
    const top = TOP_RESERVE * designPx
    const bottom = BOTTOM_RESERVE * designPx
    const zoom = Math.min(size.width / (ROOM_W + 0.8), (size.height - top - bottom) / (ROOM_H + 0.8))
    cam.zoom = zoom
    const shift = (bottom - top) / 2 / zoom // move the room up into the free area
    cam.position.set(ROOM_W / 2, 30, -ROOM_H / 2 + shift)
    cam.up.set(0, 0, -1)
    cam.lookAt(ROOM_W / 2, 0, -ROOM_H / 2 + shift)
    cam.updateProjectionMatrix()
  }, [camera, size])
  return null
}

// Draws its children at a position read every frame (no React re-render per server update).
function Follow({ at, children }: { at: () => { x: number; y: number } | null; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    const p = at()
    if (p && ref.current) ref.current.position.set(p.x, 0, -p.y)
  })
  return <group ref={ref}>{children}</group>
}

// Runs the own hero (game/hero.ts) every frame: movement, position reports and announced strikes.
function LocalHero() {
  useEffect(() => resetHero, [])
  useFrame((_, dt) => heroFrame(dt))
  return null
}

const ownPosition = () => (local.ready ? local : null)

// Own hero, drawn where this device has it, with the swing and hurt feedback shown at once.
function OwnHero({ color }: { color: string }) {
  const swing = useRef<Mesh>(null)
  const body = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    const now = performance.now()
    if (swing.current) swing.current.visible = feedback.swingUntil > now
    if (body.current) body.current.emissive.set(feedback.hurtUntil > now ? '#ef4444' : '#000000')
  })
  return (
    <Follow at={ownPosition}>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.8, 16]} />
        <meshStandardMaterial ref={body} color={color} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.42, 0.52, 24]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={swing} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false}>
        <ringGeometry args={[0.6, 0.75, 24]} />
        <meshBasicMaterial color="#fde68a" transparent opacity={0.85} />
      </mesh>
    </Follow>
  )
}

// Enemy: white flash when hit (at once on the hitter's screen, then as the server's stun for everyone), orange and
// a bit larger while winding up a strike.
function Enemy({ id, hp, stunned, windup }: { id: number; hp: number; stunned: boolean; windup: boolean }) {
  const material = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    const m = material.current
    if (!m) return
    const flashing = (feedback.enemyFlash.get(id) ?? 0) > performance.now() || stunned
    m.color.set(flashing ? '#ffffff' : windup ? '#fb923c' : '#ef4444')
    m.emissive.set(windup ? '#7c2d12' : '#000000')
  })
  return (
    <Follow at={() => sampleEnemy(id)}>
      <mesh position={[0, 0.35, 0]} scale={(0.7 + (0.3 * hp) / ENEMY_HP) * (windup ? 1.12 : 1)}>
        <boxGeometry args={[0.6, 0.7, 0.6]} />
        <meshStandardMaterial ref={material} color="#ef4444" />
      </mesh>
    </Follow>
  )
}

// Announced enemy strikes on this screen: a red circle that fills up until it lands (fixed pool of meshes).
const ZONES = 8
function StrikeZones() {
  const outer = useRef<(Mesh | null)[]>([])
  const inner = useRef<(Mesh | null)[]>([])
  useFrame(() => {
    const zones = visibleStrikes()
    for (let i = 0; i < ZONES; i++) {
      const o = outer.current[i]
      const f = inner.current[i]
      const z = zones[i]
      if (!o || !f) continue
      o.visible = f.visible = !!z
      if (!z) continue
      o.position.set(z.x, 0.02, -z.y)
      o.scale.setScalar(z.r)
      f.position.set(z.x, 0.025, -z.y)
      f.scale.setScalar(Math.max(0.01, z.r * z.progress))
    }
  })
  return (
    <>
      {Array.from({ length: ZONES }, (_, i) => (
        <group key={i}>
          <mesh ref={(m) => void (outer.current[i] = m)} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
            <circleGeometry args={[1, 32]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.22} depthWrite={false} />
          </mesh>
          <mesh ref={(m) => void (inner.current[i] = m)} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
            <circleGeometry args={[1, 32]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.5} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}

// ?ghost: wireframes where the server has each hero and enemy right now.
function Ghosts() {
  const s = useNet((st) => st.snapshot)
  if (!s) return null
  return (
    <>
      {s.heroes.map((h) => (
        <Follow key={h.id} at={() => latestHero(h.id)}>
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 0.8, 12]} />
            <meshBasicMaterial color="#ffffff" wireframe />
          </mesh>
        </Follow>
      ))}
      {s.enemies.map((e) => (
        <Follow key={e.id} at={() => latestEnemy(e.id)}>
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[0.6, 0.7, 0.6]} />
            <meshBasicMaterial color="#ffffff" wireframe />
          </mesh>
        </Follow>
      ))}
    </>
  )
}

function Room({ doorOpen }: { doorOpen: boolean }) {
  const wall = '#2b3446'
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM_W / 2, -0.01, -ROOM_H / 2]}>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshStandardMaterial color="#1a2131" />
      </mesh>
      <gridHelper
        args={[ROOM_H, ROOM_H, '#252e40', '#222a3a']}
        position={[ROOM_W / 2, 0, -ROOM_H / 2]}
        scale={[ROOM_W / ROOM_H, 1, 1]}
      />
      {/* Walls: left, right, bottom, top with a door gap. */}
      <mesh position={[-0.2, 0.3, -ROOM_H / 2]}>
        <boxGeometry args={[0.4, 0.6, ROOM_H + 0.8]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      <mesh position={[ROOM_W + 0.2, 0.3, -ROOM_H / 2]}>
        <boxGeometry args={[0.4, 0.6, ROOM_H + 0.8]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      <mesh position={[ROOM_W / 2, 0.3, 0.2]}>
        <boxGeometry args={[ROOM_W, 0.6, 0.4]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      {[1.75, ROOM_W - 1.75].map((x) => (
        <mesh key={x} position={[x, 0.3, -ROOM_H - 0.2]}>
          <boxGeometry args={[3.5, 0.6, 0.4]} />
          <meshStandardMaterial color={wall} />
        </mesh>
      ))}
      <mesh position={[ROOM_W / 2, doorOpen ? 0.02 : 0.3, -ROOM_H - 0.2]}>
        <boxGeometry args={[2, doorOpen ? 0.04 : 0.6, 0.4]} />
        <meshStandardMaterial color={doorOpen ? '#34d399' : '#9f1239'} emissive={doorOpen ? '#065f46' : '#000000'} />
      </mesh>
    </group>
  )
}

function Item({ kind, ghost = false }: { kind: Placeable; ghost?: boolean }) {
  const opacity = ghost ? 0.55 : 1
  if (kind === 'trap') {
    return (
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <planeGeometry args={[0.85, 0.85]} />
          <meshStandardMaterial color="#7f1d1d" transparent opacity={opacity} />
        </mesh>
        {[-0.2, 0.2].flatMap((dx) =>
          [-0.2, 0.2].map((dz) => (
            <mesh key={`${dx}${dz}`} position={[dx, 0.12, dz]}>
              <coneGeometry args={[0.1, 0.25, 6]} />
              <meshStandardMaterial color="#d1d5db" transparent opacity={opacity} />
            </mesh>
          )),
        )}
      </group>
    )
  }
  if (kind === 'chest') {
    return (
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.65, 0.5, 0.5]} />
        <meshStandardMaterial color="#f59e0b" emissive="#78350f" transparent opacity={opacity} />
      </mesh>
    )
  }
  return (
    <mesh position={[0, 0.35, 0]}>
      <boxGeometry args={[0.6, 0.7, 0.6]} />
      <meshStandardMaterial color="#ef4444" transparent opacity={opacity} />
    </mesh>
  )
}

function NextRoomEditor() {
  const send = useNet((s) => s.send)
  const cells = useNet((s) => s.snapshot?.next?.cells ?? [])
  const tool = useMaster((m) => m.tool)

  function onTap(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    const cx = Math.floor(e.point.x)
    const cy = Math.floor(-e.point.z)
    if (!isPlaceable(cx, cy)) return
    const occupied = cells.some((c) => c.cx === cx && c.cy === cy)
    if (tool === 'erase' || occupied) send({ type: 'remove', cx, cy })
    else send({ type: 'place', kind: tool, cx, cy })
  }

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM_W / 2, 0.005, -ROOM_H / 2]} onPointerDown={onTap}>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {/* Buildable band. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM_W / 2, 0.003, -(2 + (ROOM_H - 4) / 2)]}>
        <planeGeometry args={[ROOM_W, ROOM_H - 4]} />
        <meshBasicMaterial color="#6ee7b7" transparent opacity={0.06} />
      </mesh>
      {cells.map((c) => (
        <group key={`${c.cx},${c.cy}`} position={[c.cx + 0.5, 0, -(c.cy + 0.5)]}>
          <Item kind={c.kind} ghost />
        </group>
      ))}
    </group>
  )
}

export default function RoomScene() {
  const state = useNet()
  const view = useMaster((m) => m.view)
  const s = state.snapshot
  const self = me(state)
  const editing = !!s && self?.role === 'master' && view === 'next'

  return (
    <>
      <FitCamera />
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 10, 2]} intensity={1.6} />
      {self?.role === 'hero' && s && <LocalHero />}
      <Room doorOpen={editing ? false : (s?.doorOpen ?? false)} />
      {editing && <NextRoomEditor />}
      {s && !editing && (
        <>
          {s.items.map((i) => (
            <group key={i.id} position={[i.cx + 0.5, 0, -(i.cy + 0.5)]}>
              <Item kind={i.kind} />
            </group>
          ))}
          {s.enemies.map((e) => (
            <Enemy key={e.id} id={e.id} hp={e.hp} stunned={e.stunned} windup={e.windup} />
          ))}
          <StrikeZones />
        </>
      )}
      {s?.heroes.map((h) => {
        if (h.dead) return null
        const player = state.players.find((p) => p.id === h.id)
        const color = PLAYER_COLORS[player?.color ?? 0]
        if (h.id === state.you) return <OwnHero key={h.id} color={color} />
        return (
          <Follow key={h.id} at={() => sampleHero(h.id)}>
            <mesh position={[0, 0.4, 0]}>
              <cylinderGeometry args={[0.32, 0.32, 0.8, 16]} />
              <meshStandardMaterial color={color} transparent opacity={editing ? 0.35 : 1} />
            </mesh>
            {h.attacking && !editing && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
                <ringGeometry args={[0.6, 0.75, 24]} />
                <meshBasicMaterial color="#fde68a" transparent opacity={0.8} />
              </mesh>
            )}
          </Follow>
        )
      })}
      {SHOW_GHOSTS && <Ghosts />}
    </>
  )
}
