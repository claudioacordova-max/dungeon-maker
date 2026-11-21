// The 3D world: a tilted camera following the own hero (or the master's map view), the rooms of the map, every
// character with its model and animation, projectiles, effects and the enemies' announced attacks.
// Sim (x, y) maps to three (x, 0, -y); a model's forward is -Z, so facing angle a becomes rotation.y = a - PI/2.
import { Html } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Vector3, type Group, type Mesh, type PerspectiveCamera } from 'three'
import { feedback, frame as heroFrame, local, resetHero, shots as ownShots, visibleStrikes } from '../game/hero'
import { useMaster } from '../game/master'
import { me, SHOW_GHOSTS, useNet } from '../net/connection'
import { latestEnemy, sampleEnemy, sampleHero, sampleOrb, sampleShot } from '../net/interp'
import { buildableSlots, DIRS, doorState, isPlaceableCell, roomAtPoint, roomCenter } from '../shared/map'
import type { DoorState, EnemyView, HeroView, PlanItem, RoomView, ShotKind, Snapshot } from '../shared/protocol'
import { ENEMY, ENEMY_TELEGRAPH, HERO, MAX_ROOMS, ROOM_H, ROOM_W } from '../shared/rules'
import { PLAYER_COLORS } from '../ui/screens'
import {
  BurnFx,
  Chest,
  Chicken,
  EnemyOrb,
  FireSpark,
  HealFx,
  HeroBolt,
  LightOrb,
  MageHero,
  makePose,
  MeleeHero,
  Ogre,
  PolyBolt,
  PoofFx,
  PriestHero,
  RangedHero,
  RoomShell,
  SlashFx,
  Slime,
  SlimeKing,
  SpikeTrap,
  SpinFx,
  Thrower,
  type Anim,
  type Pose,
} from '../models'

type P = { x: number; y: number }

function setAnim(pose: Pose, anim: Anim) {
  if (pose.anim !== anim) {
    pose.anim = anim
    pose.t = 0
  }
}

// ---------- Camera ----------

const target = new Vector3()
const wanted = new Vector3()

function CameraRig() {
  const { camera, size } = useThree()
  const mode = useMaster((m) => m.mode)
  const editRoom = useMaster((m) => m.room)
  useFrame((_, dt) => {
    const cam = camera as PerspectiveCamera
    const net = useNet.getState()
    const s = net.snapshot
    const isMaster = me(net)?.role === 'master'
    const aspect = size.width / size.height
    const half = Math.tan((cam.fov * Math.PI) / 360)
    let cx = ROOM_W / 2
    let cy = ROOM_H / 2
    let width = 11.5
    let tilt = 0.96 // radians above the horizon
    if (!isMaster && local.ready) {
      cx = local.x
      cy = local.y + 1.6 // look a bit ahead (north): the hero sits lower on the screen
    } else if (isMaster && s) {
      tilt = 1.15
      if (mode === 'room' && editRoom !== null) {
        const room = s.rooms.find((r) => r.id === editRoom)
        if (room) {
          const c = roomCenter(room)
          cx = c.x
          cy = c.y - 0.6
          width = ROOM_W + 1.5
        }
      } else {
        const cells = [...s.rooms, ...buildableSlots(s.rooms)]
        const minX = Math.min(...cells.map((r) => r.gx)) * ROOM_W
        const maxX = (Math.max(...cells.map((r) => r.gx)) + 1) * ROOM_W
        const minY = Math.min(...cells.map((r) => r.gy)) * ROOM_H
        const maxY = (Math.max(...cells.map((r) => r.gy)) + 1) * ROOM_H
        cx = (minX + maxX) / 2
        cy = (minY + maxY) / 2
        width = Math.max(maxX - minX + 2, ((maxY - minY + 2) * aspect) / 0.75)
      }
    }
    // Distance so that `width` cells fit across the screen.
    const dist = width / 2 / (half * aspect)
    target.set(cx, 0, -cy)
    wanted.set(cx, Math.sin(tilt) * dist, -cy + Math.cos(tilt) * dist)
    const k = 1 - Math.exp(-dt * (isMaster ? 6 : 10))
    cam.position.lerp(wanted, k)
    cam.lookAt(cam.position.x, 0, cam.position.z - Math.cos(tilt) * dist)
  })
  return null
}

// ---------- Rooms ----------

function doorsOf(rooms: RoomView[], room: RoomView, forMaster: boolean) {
  const out = {} as Record<'n' | 'e' | 's' | 'w', DoorState>
  for (const dir of DIRS) {
    const state = doorState(rooms, room, dir)
    // Heroes do not see rooms still being built: their door just looks locked.
    out[dir] = !forMaster && state === 'locked' ? 'locked' : state
  }
  return out
}

const RoomTile = memo(function RoomTile({ room, doors, draft }: { room: RoomView; doors: Record<'n' | 'e' | 's' | 'w', DoorState>; draft: boolean }) {
  return (
    <group position={[room.gx * ROOM_W, 0, -room.gy * ROOM_H]}>
      <RoomShell w={ROOM_W} h={ROOM_H} doors={doors} />
      {draft && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM_W / 2, 0.03, -ROOM_H / 2]}>
          <planeGeometry args={[ROOM_W, ROOM_H]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
})

function visibleRooms(s: Snapshot, isMaster: boolean): RoomView[] {
  if (isMaster) return s.rooms
  const here = roomAtPoint(s.rooms, local.x, local.y)
  if (!here) return s.rooms.filter((r) => r.ready)
  return s.rooms.filter((r) => r.ready && Math.abs(r.gx - here.gx) <= 1 && Math.abs(r.gy - here.gy) <= 1)
}

// ---------- Actors ----------

// Places a model at a position read every frame and turns it; `update` drives its pose.
function Actor({
  at,
  facing,
  update,
  lift,
  children,
}: {
  at: () => P | null
  facing: () => number
  update: (pose: Pose, dt: number, group: Group) => void
  lift?: () => number
  children: (pose: Pose) => ReactNode
}) {
  const ref = useRef<Group>(null)
  const pose = useMemo(() => makePose(), [])
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const p = at()
    if (!p) {
      g.visible = false
      return
    }
    g.visible = true
    g.position.set(p.x, lift ? lift() : 0, -p.y)
    g.rotation.y = facing() - Math.PI / 2
    pose.t += dt
    pose.flash = Math.max(0, pose.flash - dt * 4)
    update(pose, dt, g)
  })
  return <group ref={ref}>{children(pose)}</group>
}

function HeroModel({ cls, pose, tint }: { cls: HeroView['cls']; pose: Pose; tint: string }) {
  if (cls === 'melee') return <MeleeHero pose={pose} tint={tint} />
  if (cls === 'ranged') return <RangedHero pose={pose} tint={tint} />
  if (cls === 'priest') return <PriestHero pose={pose} tint={tint} />
  return <MageHero pose={pose} tint={tint} />
}

function ShotModel({ kind, crit }: { kind: ShotKind; crit: boolean }) {
  if (kind === 'light') return <LightOrb />
  if (kind === 'spark') return <FireSpark />
  if (kind === 'poly') return <PolyBolt />
  return <HeroBolt crit={crit} />
}

function EnemyModel({ kind, pose }: { kind: EnemyView['kind']; pose: Pose }) {
  if (kind === 'slime') return <Slime pose={pose} />
  if (kind === 'thrower') return <Thrower pose={pose} />
  if (kind === 'ogre') return <Ogre pose={pose} />
  return <SlimeKing pose={pose} />
}

// Heal burst on a hero (radius ~0.6) or around the praying priestess (her prayer's reach).
function HealBurst({ at, radius }: { at: () => number; radius: number }) {
  return <FxProgress get={() => Math.min(1, (performance.now() - at()) / 650)}>{(p) => <HealFx progress={p} radius={radius} />}</FxProgress>
}

// Slash / spin effect after an attack, driven by a clock function (ms of the last attack or -1).
function AttackFx({ cls, at, kind, dir }: { cls: HeroView['cls']; at: () => number; kind: () => 'basic' | 'charged'; dir: () => number }) {
  const slash = useRef<Group>(null)
  const spin = useRef<Group>(null)
  const progress = useRef({ v: 1 })
  useFrame(() => {
    const p = Math.min(1, (performance.now() - at()) / 280)
    progress.current.v = p
    const show = p < 1 && cls === 'melee'
    if (slash.current) {
      slash.current.visible = show && kind() === 'basic'
      slash.current.rotation.y = dir() - Math.PI / 2
    }
    if (spin.current) spin.current.visible = show && kind() === 'charged'
  })
  return (
    <>
      <group ref={slash} visible={false}>
        <FxProgress get={() => progress.current.v}>{(p) => <SlashFx progress={p} radius={HERO.melee.basic.range} arc={HERO.melee.basic.arc} />}</FxProgress>
      </group>
      <group ref={spin} visible={false}>
        <FxProgress get={() => progress.current.v}>{(p) => <SpinFx progress={p} radius={HERO.melee.charged.range} />}</FxProgress>
      </group>
    </>
  )
}

// Effects take `progress` as a prop; re-render them only while they play (about every 6% of progress).
function FxProgress({ get, children }: { get: () => number; children: (p: number) => ReactNode }) {
  const [p, setP] = useState(1)
  useFrame(() => {
    const v = get()
    if ((v < 1 && Math.abs(v - p) > 0.06) || (v >= 1 && p < 1)) setP(v >= 1 ? 1 : v)
  })
  return <>{p < 1 && children(p)}</>
}

const ownPos = () => (local.ready ? local : null)
const ownFacing = () => local.facing

function useHealClock(hero: HeroView) {
  const seen = useRef({ heals: hero.heals, at: -1e9 })
  if (hero.heals !== seen.current.heals) {
    seen.current.heals = hero.heals
    seen.current.at = performance.now()
  }
  return () => seen.current.at
}

function OwnHero({ hero, color }: { hero: HeroView; color: string }) {
  const aim = useRef<Group>(null)
  const aimMesh = useRef<Mesh>(null)
  const healAt = useHealClock(hero)
  const prayAt = () => (local.cls === 'priest' && feedback.attackKind === 'charged' ? feedback.attackAt : -1e9)
  useFrame(() => {
    const a = aim.current
    if (!a) return
    const showing = local.charge > 0.05 || local.aim !== null
    a.visible = showing
    if (!showing) return
    a.position.set(local.x, 0.04, -local.y)
    a.rotation.y = (local.aim ?? local.facing) - Math.PI / 2
    if (aimMesh.current) aimMesh.current.scale.set(1, 1, 0.4 + 0.6 * local.charge)
  })
  const range = HERO[local.cls].basic.range
  return (
    <>
      <Actor
        at={ownPos}
        facing={ownFacing}
        update={(pose) => {
          const now = performance.now()
          pose.charge = local.charge
          if (now - feedback.hurtAt < 220) {
            setAnim(pose, 'hurt')
            pose.flash = 1
          } else if (now - feedback.attackAt < 320) setAnim(pose, feedback.attackKind === 'charged' ? 'special' : 'attack')
          else if (local.charge > 0.15) setAnim(pose, 'charge')
          else setAnim(pose, local.moving ? 'run' : 'idle')
        }}
      >
        {(pose) => (
          <>
            <HeroModel cls={hero.cls} pose={pose} tint={color} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <ringGeometry args={[0.46, 0.56, 28]} />
              <meshBasicMaterial color="#38bdf8" />
            </mesh>
            <AttackFx cls={hero.cls} at={() => feedback.attackAt} kind={() => feedback.attackKind} dir={() => feedback.attackDir - local.facing + Math.PI / 2} />
            <HealBurst at={healAt} radius={0.6} />
            <HealBurst at={prayAt} radius={HERO.priest.charged.range} />
          </>
        )}
      </Actor>
      <group ref={aim} visible={false}>
        <mesh ref={aimMesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -range / 2]}>
          <planeGeometry args={[local.cls === 'melee' ? 1.6 : 0.5, range]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      </group>
    </>
  )
}

function OtherHero({ hero, color }: { hero: HeroView; color: string }) {
  const healAt = useHealClock(hero)
  const last = useRef({ x: 0, y: 0, seq: hero.act?.seq ?? 0, at: -1e9, kind: 'basic' as 'basic' | 'charged', hp: hero.hp, hurtAt: -1e9 })
  const view = useRef(hero)
  view.current = hero
  return (
    <Actor
      at={() => sampleHero(hero.id)}
      facing={() => view.current.facing}
      update={(pose, dt) => {
        const h = view.current
        const p = sampleHero(h.id)
        const now = performance.now()
        const l = last.current
        if (h.act && h.act.seq !== l.seq) {
          l.seq = h.act.seq
          l.at = now
          l.kind = h.act.kind
        }
        if (h.hp < l.hp) l.hurtAt = now
        l.hp = h.hp
        const speed = p ? Math.hypot(p.x - l.x, p.y - l.y) / Math.max(dt, 1e-3) : 0
        if (p) {
          l.x = p.x
          l.y = p.y
        }
        if (now - l.hurtAt < 220) {
          setAnim(pose, 'hurt')
          pose.flash = 1
        } else if (now - l.at < 320) setAnim(pose, l.kind === 'charged' ? 'special' : 'attack')
        else setAnim(pose, speed > 0.6 ? 'run' : 'idle')
      }}
    >
      {(pose) => (
        <>
          <HeroModel cls={hero.cls} pose={pose} tint={color} />
          <AttackFx cls={hero.cls} at={() => last.current.at} kind={() => last.current.kind} dir={() => Math.PI / 2} />
          <HealBurst at={healAt} radius={0.6} />
          {hero.cls === 'priest' && <HealBurst at={() => (last.current.kind === 'charged' ? last.current.at : -1e9)} radius={HERO.priest.charged.range} />}
        </>
      )}
    </Actor>
  )
}

function HeroLabel({ hero, name, color, own }: { hero: HeroView; name: string; color: string; own: boolean }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    const p = own ? ownPos() : sampleHero(hero.id)
    if (p && ref.current) ref.current.position.set(p.x, 1.55, -p.y)
  })
  return (
    <group ref={ref}>
      <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className={own ? 'world-label is-own' : 'world-label'}>
          <span className="world-name" style={{ color }}>
            {name}
          </span>
          <span className="world-hp">
            {Array.from({ length: 4 }, (_, i) => (
              <i key={i} className={i < hero.hp ? 'on' : ''} />
            ))}
          </span>
        </div>
      </Html>
    </group>
  )
}

function EnemyActor({ enemy }: { enemy: EnemyView }) {
  const view = useRef(enemy)
  view.current = enemy
  const track = useRef({ state: enemy.state, since: performance.now(), x: enemy.x, y: enemy.y, chicken: enemy.chicken, poofAt: -1e9 })
  if (enemy.chicken !== track.current.chicken) {
    track.current.chicken = enemy.chicken
    track.current.poofAt = performance.now()
  }
  return (
    <Actor
      at={() => sampleEnemy(enemy.id)}
      facing={() => view.current.facing}
      lift={() => {
        const e = view.current
        if (e.state !== 'jump') return 0
        const k = Math.min(1, (performance.now() - track.current.since) / (ENEMY_TELEGRAPH * 1000))
        return Math.sin(k * Math.PI) * 2.2
      }}
      update={(pose) => {
        const e = view.current
        const tr = track.current
        const now = performance.now()
        if (e.state !== tr.state) {
          const was = tr.state
          tr.state = e.state
          tr.since = now
          if (was === 'windup') setAnim(pose, e.kind === 'slime' ? 'idle' : e.kind === 'ogre' ? 'land' : 'throw')
          if (was === 'jump') setAnim(pose, 'land')
        }
        const flashing = e.stunned || (feedback.enemyFlash.get(e.id) ?? 0) > now
        if (flashing) pose.flash = 1
        const recent = now - tr.since
        if (e.state === 'windup') {
          setAnim(pose, 'windup')
          pose.charge = Math.min(1, recent / (ENEMY_TELEGRAPH * 1000))
        } else if (e.state === 'jump') {
          setAnim(pose, 'jump')
          pose.charge = Math.min(1, recent / (ENEMY_TELEGRAPH * 1000))
        } else if ((pose.anim === 'throw' || pose.anim === 'land') && pose.t < 0.4) {
          // let the one-shot finish
        } else if (flashing) setAnim(pose, 'hurt')
        else setAnim(pose, e.state === 'move' ? 'run' : 'idle')
      }}
    >
      {(pose) => (
        <>
          {enemy.chicken ? <Chicken pose={pose} scale={enemy.kind === 'king' ? 2.4 : enemy.kind === 'ogre' ? 1.5 : 1} /> : <EnemyModel kind={enemy.kind} pose={pose} />}
          {enemy.burning && <Burning radius={ENEMY[enemy.kind].radius} />}
          <FxProgress get={() => Math.min(1, (performance.now() - track.current.poofAt) / 450)}>
            {(p) => <PoofFx progress={p} scale={enemy.kind === 'king' ? 2.4 : enemy.kind === 'ogre' ? 1.6 : 1} />}
          </FxProgress>
          <EnemyBar enemy={view} />
        </>
      )}
    </Actor>
  )
}

function Burning({ radius }: { radius: number }) {
  const [time, setTime] = useState(0)
  useFrame(({ clock }) => {
    // ~15 updates a second is plenty for flickering flames
    const t = Math.floor(clock.elapsedTime * 15) / 15
    if (t !== time) setTime(t)
  })
  return <BurnFx time={time} radius={radius} />
}

// Small health bar above an enemy, only once it is hurt.
function EnemyBar({ enemy }: { enemy: { current: EnemyView } }) {
  const fill = useRef<Mesh>(null)
  const bar = useRef<Group>(null)
  const kind = enemy.current.kind
  const h = kind === 'king' ? 3 : kind === 'ogre' ? 2.2 : 1.25
  const w = kind === 'king' ? 2.4 : kind === 'ogre' ? 1.4 : 0.8
  useFrame(({ camera }) => {
    const e = enemy.current
    if (!bar.current || !fill.current) return
    bar.current.visible = e.hp < e.max
    bar.current.quaternion.copy(camera.quaternion)
    if (bar.current.parent) bar.current.quaternion.premultiply(bar.current.parent.quaternion.clone().invert())
    const k = Math.max(0, e.hp / e.max)
    fill.current.scale.x = Math.max(0.001, k)
    fill.current.position.x = (-w / 2) * (1 - k)
  })
  return (
    <group ref={bar} position={[0, h, 0]} visible={false}>
      <mesh>
        <planeGeometry args={[w + 0.08, 0.2]} />
        <meshBasicMaterial color="#1f0a0a" />
      </mesh>
      <mesh ref={fill} position={[0, 0, 0.01]}>
        <planeGeometry args={[w, 0.13]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
    </group>
  )
}

// Enemies removed by the server play a short death before disappearing.
type Dying = { id: number; kind: EnemyView['kind']; chicken: boolean; x: number; y: number; facing: number; at: number }
function useDying(s: Snapshot | null) {
  const known = useRef(new Map<number, EnemyView>())
  const dying = useRef<Dying[]>([])
  if (s) {
    const now = performance.now()
    const ids = new Set(s.enemies.map((e) => e.id))
    for (const [id, e] of known.current) {
      if (!ids.has(id)) {
        const p = latestEnemy(id) ?? e
        dying.current.push({ id, kind: e.kind, chicken: e.chicken, x: p.x, y: p.y, facing: e.facing, at: now })
        known.current.delete(id)
      }
    }
    for (const e of s.enemies) known.current.set(e.id, e)
    dying.current = dying.current.filter((d) => now - d.at < 700)
  }
  return dying.current
}

function DyingActor({ d }: { d: Dying }) {
  return (
    <Actor at={() => (performance.now() - d.at < 700 ? d : null)} facing={() => d.facing} update={(pose) => setAnim(pose, 'die')}>
      {(pose) => (d.chicken ? <Chicken pose={pose} scale={d.kind === 'king' ? 2.4 : 1} /> : <EnemyModel kind={d.kind} pose={pose} />)}
    </Actor>
  )
}

// ---------- Projectiles, zones, items ----------

const SHOT_KINDS: ShotKind[] = ['arrow', 'light', 'spark', 'poly']
function OwnShots() {
  const pool = useRef<(Group | null)[]>([])
  useFrame(() => {
    // One small pool per kind: the i-th visible shot of a kind uses that kind's i-th model.
    const used = [0, 0, 0, 0]
    for (const g of pool.current) if (g) g.visible = false
    for (const s of ownShots) {
      const k = SHOT_KINDS.indexOf(s.kind)
      const g = pool.current[k * 8 + used[k]++]
      if (!g) continue
      g.visible = true
      g.position.set(s.x, 0.6, -s.y)
      g.rotation.y = s.dir - Math.PI / 2
      g.scale.setScalar(s.crit ? 1.4 : 1)
    }
  })
  const kinds = SHOT_KINDS.filter((k) => k === shotKindOf(local.cls) || (local.cls === 'mage' && k === 'poly'))
  return (
    <>
      {SHOT_KINDS.map((kind, k) =>
        kinds.includes(kind)
          ? Array.from({ length: 8 }, (_, i) => (
              <group key={`${kind}${i}`} ref={(g) => void (pool.current[k * 8 + i] = g)} visible={false}>
                <ShotModel kind={kind} crit={false} />
              </group>
            ))
          : null,
      )}
    </>
  )
}

const shotKindOf = (cls: HeroView['cls']): ShotKind => (cls === 'priest' ? 'light' : cls === 'mage' ? 'spark' : 'arrow')

function Moving({ at, dir, y, children }: { at: () => P | null; dir?: number; y: number; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    const p = at()
    if (!ref.current) return
    ref.current.visible = !!p
    if (p) ref.current.position.set(p.x, y, -p.y)
  })
  return (
    <group ref={ref} rotation={[0, (dir ?? Math.PI / 2) - Math.PI / 2, 0]}>
      {children}
    </group>
  )
}

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
      o.position.set(z.x, 0.05, -z.y)
      o.scale.setScalar(z.r)
      f.position.set(z.x, 0.06, -z.y)
      f.scale.setScalar(Math.max(0.01, z.r * z.progress))
    }
  })
  return (
    <>
      {Array.from({ length: ZONES }, (_, i) => (
        <group key={i}>
          <mesh ref={(m) => void (outer.current[i] = m)} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
            <circleGeometry args={[1, 40]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.25} depthWrite={false} />
          </mesh>
          <mesh ref={(m) => void (inner.current[i] = m)} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
            <circleGeometry args={[1, 40]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.55} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}

// A thrower's (or the boss's) aim line while it winds up: where its orb will fly.
function AimLine({ enemy, dir, fan }: { enemy: number; dir: number; fan: boolean }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    const p = sampleEnemy(enemy)
    if (!ref.current) return
    ref.current.visible = !!p
    if (p) ref.current.position.set(p.x, 0.05, -p.y)
  })
  const len = ENEMY.thrower.orbRange
  const angles = fan ? Array.from({ length: ENEMY.king.fanOrbs }, (_, i) => dir + (i - (ENEMY.king.fanOrbs - 1) / 2) * 0.32) : [dir]
  return (
    <group ref={ref}>
      {angles.map((a, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, a]} position={[(Math.cos(a) * len) / 2, 0, (-Math.sin(a) * len) / 2]}>
          <planeGeometry args={[len, 0.22]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function TrapItem() {
  const pose = useMemo(() => makePose(), [])
  useFrame((_, dt) => {
    pose.t += dt
  })
  return <SpikeTrap pose={pose} />
}

// ---------- Master building ----------

function Slots({ s }: { s: Snapshot }) {
  const setSlot = useMaster((m) => m.setSlot)
  const chosen = useMaster((m) => m.slot)
  const bossPlaced = s.rooms.some((r) => r.kind === 'boss')
  if (bossPlaced) return null
  const bossNext = s.normalRooms >= MAX_ROOMS
  return (
    <>
      {buildableSlots(s.rooms).map((slot) => {
        const active = chosen?.gx === slot.gx && chosen?.gy === slot.gy
        return (
          <group key={`${slot.gx},${slot.gy}`} position={[(slot.gx + 0.5) * ROOM_W, 0.02, -(slot.gy + 0.5) * ROOM_H]}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              onPointerDown={(e) => {
                e.stopPropagation()
                setSlot(slot)
              }}
            >
              <planeGeometry args={[ROOM_W - 0.6, ROOM_H - 0.6]} />
              <meshBasicMaterial color={bossNext ? '#a855f7' : '#ffc533'} transparent opacity={active ? 0.45 : 0.18} depthWrite={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
              <planeGeometry args={[3, 0.6]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.7} depthWrite={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
              <planeGeometry args={[0.6, 3]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.7} depthWrite={false} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

function PlanGhost({ item }: { item: PlanItem }) {
  const pose = useMemo(() => makePose(), [])
  useFrame((_, dt) => {
    pose.t += dt
  })
  const node =
    item.kind === 'chest' ? <Chest opened={false} /> : item.kind === 'trap' ? <SpikeTrap pose={pose} /> : <EnemyModel kind={item.kind} pose={pose} />
  return <group position={[item.cx + 0.5, 0, -(item.cy + 0.5)]}>{node}</group>
}

function RoomEditor({ room }: { room: RoomView }) {
  const send = useNet((st) => st.send)
  const tool = useMaster((m) => m.tool)
  const plan = room.plan ?? []
  const editable = !room.entered && room.kind !== 'start'
  function onTap(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    if (!editable) return
    const cx = Math.floor(e.point.x - room.gx * ROOM_W)
    const cy = Math.floor(-e.point.z - room.gy * ROOM_H)
    if (!isPlaceableCell(cx, cy)) return
    const occupied = plan.some((p) => p.cx === cx && p.cy === cy)
    if (tool === 'erase' || occupied) send({ type: 'remove', room: room.id, cx, cy })
    else send({ type: 'place', room: room.id, kind: tool, cx, cy })
  }
  return (
    <group position={[room.gx * ROOM_W, 0, -room.gy * ROOM_H]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM_W / 2, 0.04, -ROOM_H / 2]} onPointerDown={onTap}>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {editable && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM_W / 2, 0.035, -ROOM_H / 2]}>
          <planeGeometry args={[ROOM_W - 2, ROOM_H - 2]} />
          <meshBasicMaterial color="#6ee7b7" transparent opacity={0.1} depthWrite={false} />
        </mesh>
      )}
      {!room.ready && plan.map((item) => <PlanGhost key={`${item.cx},${item.cy}`} item={item} />)}
    </group>
  )
}

function MasterPicker({ s }: { s: Snapshot }) {
  const editRoom = useMaster((m) => m.editRoom)
  // Tapping a room on the map opens it for editing.
  return (
    <>
      {s.rooms
        .filter((r) => r.kind !== 'start')
        .map((r) => (
          <mesh
            key={r.id}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[(r.gx + 0.5) * ROOM_W, 0.05, -(r.gy + 0.5) * ROOM_H]}
            onPointerDown={(e) => {
              e.stopPropagation()
              editRoom(r.id)
            }}
          >
            <planeGeometry args={[ROOM_W, ROOM_H]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}
    </>
  )
}

// ---------- Scene ----------

function LocalHeroLoop() {
  useEffect(() => resetHero, [])
  useFrame((_, dt) => heroFrame(dt))
  return null
}

export default function World() {
  const state = useNet()
  const s = state.snapshot
  const self = me(state)
  const isMaster = self?.role === 'master'
  const mode = useMaster((m) => m.mode)
  const editId = useMaster((m) => m.room)
  const dying = useDying(s)
  if (!s) return <LobbyBackdrop />
  const rooms = visibleRooms(s, isMaster)
  const roomIds = new Set(rooms.map((r) => r.id))
  const editRoom = isMaster && mode === 'room' ? s.rooms.find((r) => r.id === editId) : undefined

  return (
    <>
      <CameraRig />
      <ambientLight intensity={1.15} />
      <directionalLight position={[6, 14, 4]} intensity={1.8} />
      {self?.role === 'hero' && <LocalHeroLoop />}
      {rooms.map((r) => (
        <RoomTile key={r.id} room={r} doors={doorsOf(s.rooms, r, isMaster)} draft={isMaster && !r.ready} />
      ))}
      {isMaster && mode === 'map' && <Slots s={s} />}
      {isMaster && mode === 'map' && <MasterPicker s={s} />}
      {editRoom && <RoomEditor room={editRoom} />}
      {s.items
        .filter((i) => roomIds.has(i.room))
        .map((i) => (
          <group key={i.id} position={[i.x, 0, -i.y]}>
            {i.kind === 'chest' ? <Chest opened={i.opened} /> : <TrapItem />}
          </group>
        ))}
      {s.enemies
        .filter((e) => roomIds.has(e.room))
        .map((e) => (
          <EnemyActor key={e.id} enemy={e} />
        ))}
      {dying.map((d) => (
        <DyingActor key={`d${d.id}`} d={d} />
      ))}
      {s.heroes.map((h) => {
        if (h.dead) return null
        const player = state.players.find((p) => p.id === h.id)
        const color = PLAYER_COLORS[player?.color ?? 0]
        const own = h.id === state.you
        return (
          <group key={h.id}>
            {own ? <OwnHero hero={h} color={color} /> : <OtherHero hero={h} color={color} />}
            <HeroLabel hero={h} name={player?.name ?? '?'} color={color} own={own} />
          </group>
        )
      })}
      <OwnShots />
      {s.shots
        .filter((sh) => sh.owner !== state.you)
        .map((sh) => (
          <Moving key={sh.id} at={() => sampleShot(sh.id)} dir={sh.dir} y={0.6}>
            <ShotModel kind={sh.kind} crit={sh.crit} />
          </Moving>
        ))}
      {s.orbs.map((o) => (
        <Moving key={o.id} at={() => sampleOrb(o.id)} y={0.55}>
          <EnemyOrb />
        </Moving>
      ))}
      {s.aims.map((a) => (
        <AimLine key={a.enemy} enemy={a.enemy} dir={a.dir} fan={s.enemies.find((e) => e.id === a.enemy)?.kind === 'king'} />
      ))}
      <StrikeZones />
      {SHOW_GHOSTS && <Ghosts s={s} />}
    </>
  )
}

function Ghosts({ s }: { s: Snapshot }) {
  return (
    <>
      {s.enemies.map((e) => (
        <Moving key={e.id} at={() => latestEnemy(e.id)} y={0.35}>
          <mesh>
            <boxGeometry args={[0.6, 0.7, 0.6]} />
            <meshBasicMaterial color="#ffffff" wireframe />
          </mesh>
        </Moving>
      ))}
    </>
  )
}

// Behind the home and lobby screens: the start room with a couple of idle slimes.
function LobbyBackdrop() {
  const { camera } = useThree()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.15
    camera.position.set(ROOM_W / 2 + Math.sin(t) * 3, 14, -ROOM_H / 2 + 11)
    camera.lookAt(ROOM_W / 2, 0, -ROOM_H / 2)
  })
  const pose = useMemo(() => makePose(), [])
  const pose2 = useMemo(() => makePose(), [])
  useFrame((_, dt) => {
    pose.t += dt
    pose2.t += dt * 0.9
  })
  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[6, 14, 4]} intensity={1.8} />
      <RoomShell w={ROOM_W} h={ROOM_H} doors={{ n: 'closed', e: 'none', s: 'none', w: 'none' }} />
      <group position={[3.5, 0, -8]}>
        <Slime pose={pose} />
      </group>
      <group position={[7.5, 0, -6]} rotation={[0, 0.6, 0]}>
        <Slime pose={pose2} />
      </group>
    </>
  )
}

