// The 3D world: a tilted camera following the own hero (or the master's map view), the rooms of the map, every
// character with its model and animation, projectiles, effects and the enemies' announced attacks.
// Sim (x, y) maps to three (x, 0, -y); a model's forward is -Z, so facing angle a becomes rotation.y = a - PI/2.
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { autoAim, feedback, frame as heroFrame, local, resetHero, shots as ownShots, visibleStrikes } from '../game/hero'
import { setAttackStick, setSpecialStick } from '../game/input'
import { isBuilding, tapCell, useMaster } from '../game/master'
import { hereRoom, lord, lordFrame, resetLord } from '../game/lord'
import { ctl, possessFrame, resetPossess } from '../game/possess'
import { me, SHOW_GHOSTS, useNet } from '../net/connection'
import { latestEnemy, sampleEnemy, sampleHero, sampleOrb, sampleShot } from '../net/interp'
import { CHEST_SLOTS, floorCell, SPIKES } from '../shared/layouts'
import { buildableSlots, DIRS, doorState, isPlaceableCell, overGap, roomAtPoint } from '../shared/map'
import type { DoorState, EnemyView, HeroView, PlanItem, RoomView, ShotKind, Snapshot, SpikePhase } from '../shared/protocol'
import { ENEMY, ENEMY_TELEGRAPH, HERO, HERO_HITS, LORD, MAX_ROOMS, POSSESS, ROOM_H, ROOM_W, SUMMON } from '../shared/rules'
import { PLAYER_COLORS } from '../ui/screens'
import { MasterLord } from '../models/Master'
import { PossessSmoke, PotionFx, SummonFx } from '../models/MagicEffects'
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
const corner = new Vector3()
const probe = new PerspectiveCamera()

type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

// Screen band (px, relative to the canvas) not covered by the HUD's top bar and the master's panel.
function freeBand(canvas: HTMLCanvasElement, height: number) {
  const c = canvas.getBoundingClientRect()
  const top = Math.max(
    document.querySelector('.hud-top')?.getBoundingClientRect().bottom ?? c.top,
    document.querySelector('.master-top')?.getBoundingClientRect().bottom ?? c.top,
  )
  const bottom = document.querySelector('.master-panel')?.getBoundingClientRect().top ?? c.bottom
  // The Maestro's terrain rail (building) sits on the right edge: keep the room clear of it.
  const right = document.querySelector('.master-rail')?.getBoundingClientRect().left ?? c.right
  return { top: Math.max(0, top - c.top + 6), bottom: Math.min(height, bottom - c.top - 6), left: 0, right: Math.min(c.width, right - c.left - 4) }
}

// Master camera: distance and center so that `b` (walls included) fits the free band, solved on a probe camera.
function fitMaster(b: Bounds, tilt: number, fov: number, w: number, h: number, band: { top: number; bottom: number; left: number; right: number }) {
  probe.fov = fov
  probe.aspect = w / h
  probe.updateProjectionMatrix()
  let cx = (b.minX + b.maxX) / 2
  let cy = (b.minY + b.maxY) / 2
  let dist = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 1.6
  const freeH = Math.max(80, band.bottom - band.top)
  for (let i = 0; i < 5; i++) {
    probe.position.set(cx, Math.sin(tilt) * dist, -cy + Math.cos(tilt) * dist)
    probe.lookAt(cx, 0, -cy)
    probe.updateMatrixWorld()
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const x of [b.minX, b.maxX])
      for (const y of [b.minY, b.maxY])
        for (const z of [0, 1.3]) {
          corner.set(x, z, -y).project(probe)
          const px = ((corner.x + 1) / 2) * w
          const py = ((1 - corner.y) / 2) * h
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py)
        }
    const k = Math.max((x1 - x0) / ((band.right - band.left) * 0.96), (y1 - y0) / (freeH * 0.94))
    const pxPerUnit = h / (2 * dist * Math.tan((fov * Math.PI) / 360))
    // Content below the band's middle: look further south so it rises on the screen (and vice versa).
    cy -= ((y0 + y1) / 2 - (band.top + band.bottom) / 2) / pxPerUnit / Math.sin(tilt)
    cx += ((x0 + x1) / 2 - (band.left + band.right) / 2) / pxPerUnit
    dist *= k
  }
  return { cx, cy, dist }
}

function CameraRig() {
  const { camera, size, gl } = useThree()
  useFrame((_, dt) => {
    const cam = camera as PerspectiveCamera
    const net = useNet.getState()
    const s = net.snapshot
    const isMaster = me(net)?.role === 'master'
    const aspect = size.width / size.height
    const half = Math.tan((cam.fov * Math.PI) / 360)
    let cx = ROOM_W / 2
    let cy = ROOM_H / 2
    let tilt = 0.96 // radians above the horizon
    // 11.5 cells across a phone; on a wide (desktop) window, keep about the phone's depth and show more sideways.
    let dist = Math.max(11.5 / 2 / (half * aspect), 10 / half)
    const cine = s?.cinematic ? s.rooms.find((r) => r.id === s.cinematic!.room) : undefined
    if (!isMaster && cine) {
      // Boss entrance: every hero looks at the boss room.
      cx = (cine.gx + 0.5) * ROOM_W
      cy = (cine.gy + 0.5) * ROOM_H - 1
      dist *= 1.15
    } else if (!isMaster && local.ready) {
      cx = local.x
      cy = local.y + 1.6 // look a bit ahead (north): the hero sits lower on the screen
    } else if (isMaster && s) {
      const held = ctl.id !== null ? s.enemies.find((e) => e.id === ctl.id) : undefined
      if (held) {
        // Controlling an enemy: the camera follows it like a hero's (a bit wider for the boss).
        cx = ctl.x
        cy = ctl.y + 1.6
        dist *= held.kind === 'king' ? 1.35 : 1.1
      } else if (!cine && lord.ready && !useMaster.getState().buildView) {
        // The Maestro's body: always followed, a little wider than a hero.
        cx = lord.x
        cy = lord.y + 1.6
        dist *= 1.15
      } else {
        // After touching a building control (or the boss entrance): the whole room fits the screen, to build with
        // care. Moving the body ends it.
        tilt = 1.15
        const gx = cine ? cine.gx : Math.floor(lord.x / ROOM_W)
        const gy = cine ? cine.gy : Math.floor(lord.y / ROOM_H)
        const b: Bounds = { minX: gx * ROOM_W, maxX: (gx + 1) * ROOM_W, minY: gy * ROOM_H, maxY: (gy + 1) * ROOM_H }
        const fit = fitMaster(b, tilt, cam.fov, size.width, size.height, freeBand(gl.domElement, size.height))
        cx = fit.cx
        cy = fit.cy
        dist = fit.dist
      }
    }
    target.set(cx, 0, -cy)
    wanted.set(cx, Math.sin(tilt) * dist, -cy + Math.cos(tilt) * dist)
    const k = 1 - Math.exp(-dt * (isMaster && (useMaster.getState().buildView || s?.cinematic) ? 6 : 10))
    cam.position.lerp(wanted, k)
    cam.lookAt(cam.position.x, 0, cam.position.z - Math.cos(tilt) * dist)
    // Development only: lets the visual tests find a world point on the screen.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __dmProject?: (x: number, y: number) => [number, number] }).__dmProject = (x, y) => {
        const v = new Vector3(x, 0.3, -y).project(cam)
        const r = gl.domElement.getBoundingClientRect()
        return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height]
      }
      ;(window as unknown as { __dmNet?: typeof useNet }).__dmNet = useNet
    }
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
      <RoomShell w={ROOM_W} h={ROOM_H} doors={doors} shape={room.shape} />
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
  // During the boss entrance every hero watches the boss room, wherever it is.
  const cine = s.cinematic ? s.rooms.find((r) => r.id === s.cinematic!.room) : undefined
  const near = (r: RoomView, c: RoomView) => Math.abs(r.gx - c.gx) <= 1 && Math.abs(r.gy - c.gy) <= 1
  return s.rooms.filter((r) => r.ready && (near(r, here) || (cine && near(r, cine))))
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

function EnemyModel({ kind, pose, possessed = false }: { kind: EnemyView['kind']; pose: Pose; possessed?: boolean }) {
  if (kind === 'slime') return <Slime pose={pose} possessed={possessed} />
  if (kind === 'thrower') return <Thrower pose={pose} possessed={possessed} />
  if (kind === 'ogre') return <Ogre pose={pose} possessed={possessed} />
  return <SlimeKing pose={pose} possessed={possessed} />
}

// A potion drunk by a hero: a red-pink glow around it.
function PotionBurst({ at }: { at: () => number }) {
  return <FxProgress get={() => Math.min(1, (performance.now() - at()) / 900)}>{(p) => <PotionFx progress={p} />}</FxProgress>
}

function useDrinkClock(hero: HeroView) {
  const seen = useRef({ drinks: hero.drinks, at: -1e9 })
  if (hero.drinks !== seen.current.drinks) {
    seen.current.drinks = hero.drinks
    seen.current.at = performance.now()
  }
  return () => seen.current.at
}

// Seconds since the boss entrance began, smooth between snapshots (null when there is none).
const cinema = { room: -1, start: 0 }
function cinemaTime(s: Snapshot | null): number | null {
  if (!s?.cinematic) return null
  const now = performance.now()
  if (cinema.room !== s.cinematic.room) {
    cinema.room = s.cinematic.room
    cinema.start = now - s.cinematic.t * 1000
  }
  return (now - cinema.start) / 1000
}
// The boss turns purple (possessed) this far into the entrance.
const POSSESS_AT = 3.2

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
// Falling into the abyss: accelerating drop (cells below the floor) after `t` seconds.
const fallDepth = (t: number) => -Math.min(12, 9 * t * t)
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
  const healAt = useHealClock(hero)
  const drinkAt = useDrinkClock(hero)
  const prayAt = () => (local.cls === 'priest' && feedback.attackKind === 'charged' ? feedback.attackAt : -1e9)
  return (
    <>
      <Actor
        at={ownPos}
        facing={ownFacing}
        lift={() => (local.fallAt >= 0 ? fallDepth((performance.now() - local.fallAt) / 1000) : 0)}
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
            <PotionBurst at={drinkAt} />
            <HealBurst at={prayAt} radius={HERO.priest.charged.range} />
          </>
        )}
      </Actor>
      <AimIndicator />
    </>
  )
}

// What the attack being aimed will reach, on the floor: a cone (swordsman's slash), a line (shots, orbs, spells)
// or a circle (swordsman's spin, priestess's prayer). Shown while a stick is held; without a manual aim it
// points where the tap would auto-aim.
type AimShape = { shape: 'cone' | 'line' | 'circle'; r: number; w?: number; color: string }
function aimShape(cls: HeroView['cls'], kind: 'basic' | 'charged'): AimShape {
  if (cls === 'melee') return kind === 'charged' ? { shape: 'circle', r: HERO.melee.charged.range, color: '#ffce2e' } : { shape: 'cone', r: HERO.melee.basic.range, color: '#ffffff' }
  if (cls === 'ranged') return kind === 'charged' ? { shape: 'line', r: HERO.ranged.charged.range, w: 0.5, color: '#ffce2e' } : { shape: 'line', r: HERO.ranged.basic.range, w: 0.35, color: '#ffffff' }
  if (cls === 'priest') return kind === 'charged' ? { shape: 'circle', r: HERO.priest.charged.range, color: '#4ade80' } : { shape: 'line', r: HERO.priest.basic.range, w: 0.4, color: '#fde68a' }
  return kind === 'charged' ? { shape: 'line', r: HERO.mage.charged.range, w: 0.45, color: '#c084fc' } : { shape: 'line', r: HERO.mage.basic.range, w: 0.35, color: '#fb923c' }
}

function AimIndicator() {
  const root = useRef<Group>(null)
  const cone = useRef<Mesh>(null)
  const line = useRef<Group>(null)
  const lineMesh = useRef<Mesh>(null)
  const circle = useRef<Mesh>(null)
  useFrame(() => {
    const g = root.current
    if (!g || !cone.current || !line.current || !lineMesh.current || !circle.current) return
    const showing = local.ready && (local.aiming || local.charge > 0.05) && local.fallAt < 0
    g.visible = showing
    if (!showing) return
    const kind = local.charge >= 1 ? 'charged' : local.aimKind
    const a = aimShape(local.cls, kind)
    g.position.set(local.x, 0.04, -local.y)
    g.rotation.y = (local.aim ?? autoAim() ?? local.facing) - Math.PI / 2
    cone.current.visible = a.shape === 'cone'
    line.current.visible = a.shape === 'line'
    circle.current.visible = a.shape === 'circle'
    for (const m of [cone.current, lineMesh.current, circle.current]) (m.material as MeshBasicMaterial).color.set(a.color)
    cone.current.scale.setScalar(a.r)
    circle.current.scale.setScalar(a.r)
    line.current.scale.set(a.w ?? 0.4, 1, a.r)
  })
  const arc = HERO.melee.basic.arc
  return (
    <group ref={root} visible={false}>
      <mesh ref={cone} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 28, Math.PI / 2 - arc / 2, arc]} />
        <meshBasicMaterial transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <group ref={line}>
        <mesh ref={lineMesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.5]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial transparent opacity={0.35} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={circle} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  )
}

function OtherHero({ hero, color }: { hero: HeroView; color: string }) {
  const healAt = useHealClock(hero)
  const drinkAt = useDrinkClock(hero)
  const last = useRef({ x: 0, y: 0, seq: hero.act?.seq ?? 0, at: -1e9, kind: 'basic' as 'basic' | 'charged', hp: hero.hp, hurtAt: -1e9 })
  const view = useRef(hero)
  view.current = hero
  const fall = useRef(-1)
  return (
    <Actor
      at={() => sampleHero(hero.id)}
      facing={() => view.current.facing}
      lift={() => {
        const p = sampleHero(hero.id)
        const s = useNet.getState().snapshot
        const over = !!p && !!s && overGap(s.rooms, p.x, p.y, 0.15)
        if (!over) fall.current = -1
        else if (fall.current < 0) fall.current = performance.now()
        return fall.current >= 0 ? fallDepth((performance.now() - fall.current) / 1000) : 0
      }}
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
          <PotionBurst at={drinkAt} />
          {hero.cls === 'priest' && <HealBurst at={() => (last.current.kind === 'charged' ? last.current.at : -1e9)} radius={HERO.priest.charged.range} />}
        </>
      )}
    </Actor>
  )
}

// Name and hit bar over every hero, for everyone (the healer reads her allies' bars here). Plain DOM elements over
// the canvas, positioned every frame: no React roots of their own, so heroes falling, dying and coming back can
// never leave a hero without its bar.
function HeroLabels() {
  const gl = useThree((st) => st.gl)
  const camera = useThree((st) => st.camera)
  const size = useThree((st) => st.size)
  const layer = useMemo(() => {
    const el = document.createElement('div')
    el.className = 'world-labels'
    return el
  }, [])
  const labels = useRef(new Map<string, { root: HTMLDivElement; name: HTMLSpanElement; pips: HTMLElement[]; text: string; hp: number }>())
  useEffect(() => {
    const parent = gl.domElement.parentElement
    parent?.appendChild(layer)
    return () => {
      layer.remove()
      labels.current.clear()
    }
  }, [gl, layer])
  const v = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const net = useNet.getState()
    const s = net.snapshot
    const seen = new Set<string>()
    for (const h of s?.heroes ?? []) {
      seen.add(h.id)
      let l = labels.current.get(h.id)
      if (!l) {
        const root = document.createElement('div')
        const name = document.createElement('span')
        name.className = 'world-name'
        const bar = document.createElement('span')
        bar.className = 'world-hp'
        const pips = Array.from({ length: HERO_HITS }, () => bar.appendChild(document.createElement('i')))
        root.append(name, bar)
        layer.appendChild(root)
        l = { root, name, pips, text: '', hp: -1 }
        labels.current.set(h.id, l)
      }
      const own = h.id === net.you
      const player = net.players.find((p) => p.id === h.id)
      const text = player?.name ?? '?'
      if (l.text !== text) {
        l.text = text
        l.name.textContent = text
        l.name.style.color = PLAYER_COLORS[player?.color ?? 0]
        l.root.className = own ? 'world-label is-own' : 'world-label'
      }
      if (l.hp !== h.hp) {
        l.hp = h.hp
        l.pips.forEach((pip, i) => pip.classList.toggle('on', i < h.hp))
      }
      const p = own ? ownPos() : sampleHero(h.id)
      const falling = own ? local.fallAt >= 0 : !!p && !!s && overGap(s.rooms, p.x, p.y, 0.15)
      if (!p || h.dead || falling) {
        l.root.style.display = 'none'
        continue
      }
      v.set(p.x, 1.55, -p.y).project(camera)
      if (v.z > 1) {
        l.root.style.display = 'none'
        continue
      }
      l.root.style.display = ''
      l.root.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`
    }
    for (const [id, l] of labels.current) {
      if (seen.has(id)) continue
      l.root.remove()
      labels.current.delete(id)
    }
  })
  return null
}

function EnemyActor({ enemy }: { enemy: EnemyView }) {
  const view = useRef(enemy)
  view.current = enemy
  const track = useRef({ state: enemy.state, since: performance.now(), x: enemy.x, y: enemy.y, chicken: enemy.chicken, poofAt: -1e9, possessed: enemy.possessed, smokeAt: -1e9 })
  if (enemy.chicken !== track.current.chicken) {
    track.current.chicken = enemy.chicken
    track.current.poofAt = performance.now()
  }
  // The boss is taken during its entrance (the smoke plays there); other enemies smoke when taken or dropped.
  if (enemy.possessed !== track.current.possessed) {
    track.current.possessed = enemy.possessed
    if (enemy.kind !== 'king') track.current.smokeAt = performance.now()
  }
  const [cinePossessed, setCinePossessed] = useState(false)
  useFrame(() => {
    if (enemy.kind !== 'king') return
    const t = cinemaTime(useNet.getState().snapshot)
    const v = t !== null && t >= POSSESS_AT
    if (v !== cinePossessed) setCinePossessed(v)
  })
  const looksPossessed = enemy.possessed || cinePossessed
  const own = () => ctl.id === enemy.id
  return (
    <Actor
      at={() => (own() ? ctl : sampleEnemy(enemy.id))}
      facing={() => (own() ? ctl.facing : view.current.facing)}
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
        else setAnim(pose, (own() ? ctl.moving : e.state === 'move') ? 'run' : 'idle')
      }}
    >
      {(pose) => (
        <>
          {enemy.chicken ? (
            <Chicken pose={pose} scale={enemy.kind === 'king' ? 2.4 : enemy.kind === 'ogre' ? 1.5 : 1} />
          ) : (
            <EnemyModel kind={enemy.kind} pose={pose} possessed={looksPossessed} />
          )}
          <FxProgress get={() => Math.min(1, (performance.now() - track.current.smokeAt) / 1200)}>
            {(p) => <PossessSmoke progress={p} scale={enemy.kind === 'ogre' ? 1.5 : 0.9} />}
          </FxProgress>
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
      {(pose) => (d.chicken ? <Chicken pose={pose} scale={d.kind === 'king' ? 2.4 : 1} /> : <EnemyModel kind={d.kind} pose={pose} possessed={d.kind === 'king'} />)}
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

function TrapItem({ phase }: { phase?: SpikePhase }) {
  const pose = useMemo(() => makePose(), [])
  const last = useRef(phase)
  if (last.current !== phase) {
    last.current = phase
    pose.t = 0
  }
  useFrame((_, dt) => {
    pose.t += dt
  })
  return <SpikeTrap pose={pose} phase={phase} />
}

// ---------- Master building ----------

function Slots({ s }: { s: Snapshot }) {
  const bossPlaced = s.rooms.some((r) => r.kind === 'boss')
  if (bossPlaced) return null
  const bossNext = s.normalRooms >= MAX_ROOMS
  return (
    <>
      {buildableSlots(s.rooms).map((slot) => {
        const active = false
        return (
          <group key={`${slot.gx},${slot.gy}`} position={[(slot.gx + 0.5) * ROOM_W, 0.02, -(slot.gy + 0.5) * ROOM_H]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
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
  return (
    <group position={[item.cx + 0.5, 0, -(item.cy + 0.5)]}>
      <EnemyModel kind={item.kind} pose={pose} />
    </group>
  )
}

// What the room's layout will add, while the master is still editing it.
function LayoutGhosts({ room }: { room: RoomView }) {
  const pose = useMemo(() => makePose(), [])
  return (
    <>
      {room.spikes &&
        SPIKES[room.shape].map(([cx, cy]) => (
          <group key={`s${cx},${cy}`} position={[cx + 0.5, 0, -(cy + 0.5)]}>
            <SpikeTrap pose={pose} phase="up" />
          </group>
        ))}
      {CHEST_SLOTS[room.shape].slice(0, room.chests).map(([cx, cy]) => (
        <group key={`c${cx},${cy}`} position={[cx + 0.5, 0, -(cy + 0.5)]}>
          <Chest opened={false} />
        </group>
      ))}
    </>
  )
}

function RoomEditor({ room }: { room: RoomView }) {
  const send = useNet((st) => st.send)
  const cell = useMaster((m) => m.cell)
  const plan = room.plan ?? []
  const editable = !room.entered && room.kind === 'normal'
  function onTap(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    if (!editable) return
    const cx = Math.floor(e.point.x - room.gx * ROOM_W)
    const cy = Math.floor(-e.point.z - room.gy * ROOM_H)
    if (!isPlaceableCell(cx, cy) || !floorCell(room.shape, cx, cy)) return
    if (room.ready) return // a ready room is changed only after "Editar"
    tapCell(room, cx, cy, send)
  }
  return (
    <group position={[room.gx * ROOM_W, 0, -room.gy * ROOM_H]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM_W / 2, 0.04, -ROOM_H / 2]} onPointerDown={onTap}>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {editable && !room.ready && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM_W / 2, 0.035, -ROOM_H / 2]}>
          <planeGeometry args={[ROOM_W - 2, ROOM_H - 2]} />
          <meshBasicMaterial color="#6ee7b7" transparent opacity={0.08} depthWrite={false} />
        </mesh>
      )}
      {cell && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cell.cx + 0.5, 0.05, -(cell.cy + 0.5)]}>
          <ringGeometry args={[0.32, 0.48, 24]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
      {!room.ready && plan.map((item) => <PlanGhost key={`${item.cx},${item.cy}`} item={item} />)}
      {!room.ready && <LayoutGhosts room={room} />}
    </group>
  )
}

// A ready room with the Maestro's powers: a tap on (or next to) an enemy takes control of it; after "Invocar", a tap
// on the floor summons a slime there (never right next to a hero: the tap is ignored).
function ObserveTapper({ room, s }: { room: RoomView; s: Snapshot }) {
  const send = useNet((st) => st.send)
  function onTap(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    if (s.possessed !== null || s.cinematic) return
    const x = e.point.x
    const y = -e.point.z
    const m = useMaster.getState()
    if (m.summoning) {
      const near = s.heroes.some((h) => {
        const p = sampleHero(h.id) ?? h
        return !h.dead && Math.hypot(p.x - x, p.y - y) < SUMMON.minHeroDistance
      })
      if (near || overGap(s.rooms, x, y, 0.3)) return
      send({ type: 'summon', room: room.id, x, y })
      m.setSummoning(false)
      return
    }
    let best = 1.4
    let id: number | null = null
    for (const enemy of s.enemies) {
      if (enemy.room !== room.id || enemy.kind === 'king') continue
      const p = sampleEnemy(enemy.id) ?? enemy
      const d = Math.hypot(p.x - x, p.y - y) - ENEMY[enemy.kind].radius
      if (d < best) {
        best = d
        id = enemy.id
      }
    }
    if (id !== null) send({ type: 'possess', enemy: id })
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(room.gx + 0.5) * ROOM_W, 0.05, -(room.gy + 0.5) * ROOM_H]} onPointerDown={onTap}>
      <planeGeometry args={[ROOM_W, ROOM_H]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

// The Maestro's body, only on its own screen: half dissolved while crossing a wall, gone while inside an enemy.
function LordActor() {
  return (
    <>
      <Actor
        at={() => (lord.ready && !lord.hidden ? lord : null)}
        facing={() => lord.facing}
        update={(pose) => setAnim(pose, lord.moving ? 'run' : 'idle')}
      >
        {(pose) => <MasterLord pose={pose} fade={() => lord.phase * 0.55} />}
      </Actor>
      <LordSmoke />
    </>
  )
}

// Puffs where the body vanished or appeared, and the trail when it flies into a possessed enemy.
function LordSmoke() {
  const group = useRef<Group>(null)
  const [, setTick] = useState(0)
  const seen = useRef(0)
  useFrame(() => {
    const now = performance.now()
    const live = lord.puffs.filter((p) => now - p.at < 900).length + (lord.trail && now - lord.trail.at < 1200 ? 1 : 0)
    if (live !== seen.current) {
      seen.current = live
      setTick((t) => t + 1)
    }
    const g = group.current
    const tr = lord.trail
    if (g && tr) {
      const k = Math.min(1, (now - tr.at) / (LORD.smokeSeconds * 1000))
      g.position.set(tr.fx + (tr.tx - tr.fx) * k, 0.3, -(tr.fy + (tr.ty - tr.fy) * k))
      g.visible = k < 1
    }
  })
  const now = performance.now()
  return (
    <>
      {lord.puffs
        .filter((p) => now - p.at < 900)
        .map((p) => (
          <group key={p.id} position={[p.x, 0, -p.y]}>
            <FxProgress get={() => Math.min(1, (performance.now() - p.at) / 900)}>{(v) => <PossessSmoke progress={v} scale={0.6} />}</FxProgress>
          </group>
        ))}
      {lord.trail && (
        <group ref={group}>
          <FxProgress get={() => Math.min(1, (performance.now() - (lord.trail?.at ?? 0)) / 1200)}>{(v) => <PossessSmoke progress={v} scale={0.5} />}</FxProgress>
        </group>
      )}
    </>
  )
}

function LordLoop() {
  useEffect(() => resetLord, [])
  useFrame((_, dt) => lordFrame(dt))
  return null
}

// While a button of the possessed enemy is held: where its attack will go (like the heroes' aim on the floor).
function PossessAim() {
  const group = useRef<Group>(null)
  const line = useRef<Mesh>(null)
  const circle = useRef<Mesh>(null)
  const fan = useRef<Group>(null)
  useFrame(() => {
    const g = group.current
    const s = useNet.getState().snapshot
    const e = s && ctl.id !== null ? s.enemies.find((x) => x.id === ctl.id) : undefined
    if (!g || !line.current || !circle.current || !fan.current) return
    g.visible = !!e && ctl.aiming && ctl.aim !== null && !e.chicken
    if (!g.visible || !e) return
    const dir = ctl.aim ?? ctl.facing
    g.position.set(ctl.x, 0.06, -ctl.y)
    g.rotation.y = dir
    line.current.visible = false
    circle.current.visible = false
    fan.current.visible = false
    const showLine = (length: number, width: number) => {
      line.current!.visible = true
      line.current!.scale.set(length, width, 1)
      line.current!.position.set(length / 2, 0, 0)
    }
    const showCircle = (ahead: number, r: number) => {
      circle.current!.visible = true
      circle.current!.scale.set(r, r, 1)
      circle.current!.position.set(ahead, 0, 0)
    }
    if (e.kind === 'slime') showLine(POSSESS.dashSeconds * ENEMY.slime.speed * POSSESS.dashSpeed, 0.7)
    else if (e.kind === 'thrower') showLine(ENEMY.thrower.orbRange, 0.4)
    else if (e.kind === 'ogre') showCircle(ENEMY.ogre.slamAhead, ENEMY.ogre.slamRadius)
    else if (ctl.button === 'special') fan.current.visible = true
    else showCircle(POSSESS.kingJump, ENEMY.king.jumpRadius)
  })
  const n = ENEMY.king.fanOrbs
  return (
    <group ref={group} visible={false}>
      <mesh ref={line} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#c084fc" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh ref={circle} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial color="#c084fc" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <group ref={fan}>
        {Array.from({ length: n }, (_, i) => (
          <group key={i} rotation={[0, (i - (n - 1) / 2) * 0.32, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ENEMY.thrower.orbRange / 2, 0, 0]}>
              <planeGeometry args={[ENEMY.thrower.orbRange, 0.3]} />
              <meshBasicMaterial color="#c084fc" transparent opacity={0.35} depthWrite={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

// A magic circle where the Maestro's summoned slime appears.
const summonState = { summonIn: 0, ids: new Set<number>(), list: [] as { x: number; y: number; at: number }[] }
function summonList(s: Snapshot) {
  const r = summonState
  if (s.summonIn > r.summonIn + 1) {
    const fresh = s.enemies.find((e) => !r.ids.has(e.id) && e.kind === 'slime')
    if (fresh) r.list.push({ x: fresh.x, y: fresh.y, at: performance.now() })
  }
  r.summonIn = s.summonIn
  r.ids = new Set(s.enemies.map((e) => e.id))
  r.list = r.list.filter((c) => performance.now() - c.at < 900)
  return r.list
}

// Boss entrance, seen by everyone: the Maestro appears beside the green boss, looks at the heroes, turns to the boss,
// dissolves into purple smoke and takes it (the boss turns purple at POSSESS_AT).
function Entrance({ s }: { s: Snapshot }) {
  const pose = useMemo(() => makePose(), [])
  const group = useRef<Group>(null)
  const boss = s.cinematic ? s.enemies.find((e) => e.kind === 'king' && e.room === s.cinematic!.room) : undefined
  const fade = useRef(1)
  useFrame((_, dt) => {
    const g = group.current
    const t = cinemaTime(useNet.getState().snapshot)
    if (!g || t === null || !boss) return
    pose.t += dt
    const bx = boss.x + 1.9
    const by = boss.y - 0.4
    // Appear (0-0.6), look at the heroes (0.6-2.1), turn to the boss (2.1-2.6), dissolve into it (2.6-3.3).
    const toBoss = Math.atan2(boss.y - by, boss.x - bx)
    let facing = -Math.PI / 2
    if (t < 0.6) fade.current = 1 - t / 0.6
    else fade.current = 0
    if (t >= 0.6 && t < 2.1) setAnim(pose, 'special')
    else if (t >= 2.1 && t < 2.6) {
      setAnim(pose, 'idle')
      facing = -Math.PI / 2 + (toBoss + Math.PI / 2) * ((t - 2.1) / 0.5)
    } else if (t >= 2.6) {
      setAnim(pose, 'attack')
      facing = toBoss
      fade.current = Math.min(1, (t - 2.6) / 0.7)
    } else setAnim(pose, 'idle')
    const k = t >= 2.6 ? Math.min(1, (t - 2.6) / 0.7) * 0.6 : 0
    g.position.set(bx + (boss.x - bx) * k, 0, -(by + (boss.y - by) * k))
    g.rotation.y = facing - Math.PI / 2
  })
  if (!boss) return null
  return (
    <>
      <group ref={group}>
        <MasterLord pose={pose} fade={() => fade.current} />
      </group>
      <group position={[boss.x + 1.9, 0, -(boss.y - 0.4)]}>
        <FxProgress get={() => Math.min(1, (cinemaTime(useNet.getState().snapshot) ?? 9) / 1.0)}>{(p) => <PossessSmoke progress={p} scale={0.8} />}</FxProgress>
      </group>
      <group position={[boss.x, 0, -boss.y]}>
        <FxProgress get={() => {
          const t = cinemaTime(useNet.getState().snapshot)
          return t === null || t < 2.8 ? 1 : Math.min(1, (t - 2.8) / 1.2)
        }}>
          {(p) => <PossessSmoke progress={p} scale={1.8} />}
        </FxProgress>
      </group>
    </>
  )
}

function PossessLoop() {
  useEffect(() => resetPossess, [])
  useFrame((_, dt) => possessFrame(dt))
  return null
}

// ---------- Scene ----------

// Mouse (desktop): left button = attack toward the cursor (held: charge), right button = special (priestess and
// mage). The cursor is projected on the floor; the direction goes through the same stick inputs as touch.
function MouseAim() {
  const gl = useThree((st) => st.gl)
  const camera = useThree((st) => st.camera)
  useEffect(() => {
    const el = gl.domElement
    const ray = new Raycaster()
    const floor = new Plane(new Vector3(0, 1, 0), 0)
    const hit = new Vector3()
    const ndc = new Vector2()
    let button = -1
    const dirAt = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      if (!ray.ray.intersectPlane(floor, hit)) return local.facing
      return Math.atan2(-hit.z - local.y, hit.x - local.x)
    }
    const set = (held: boolean, e: PointerEvent) => (button === 2 ? setSpecialStick : setAttackStick)(held, true, dirAt(e))
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || button >= 0 || (e.button !== 0 && e.button !== 2)) return
      button = e.button
      el.setPointerCapture(e.pointerId)
      set(true, e)
    }
    const move = (e: PointerEvent) => button >= 0 && e.pointerType === 'mouse' && set(true, e)
    const up = (e: PointerEvent) => {
      if (button < 0 || e.pointerType !== 'mouse') return
      set(false, e)
      button = -1
    }
    const menu = (e: Event) => e.preventDefault()
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('contextmenu', menu)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('contextmenu', menu)
    }
  }, [gl, camera])
  return null
}

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
  const here = useMaster((m) => m.here)
  const dying = useDying(s)
  if (!s) return <LobbyBackdrop />
  const summons = summonList(s)
  const rooms = visibleRooms(s, isMaster)
  const roomIds = new Set(rooms.map((r) => r.id))
  // The Maestro builds or uses its powers in the room where its body is.
  const hereR = isMaster && here ? hereRoom(s) : undefined
  const editRoom = hereR && isBuilding(s, hereR) ? hereR : undefined
  const watched = hereR && !editRoom ? hereR : undefined

  return (
    <>
      <CameraRig />
      <ambientLight intensity={1.15} />
      <directionalLight position={[6, 14, 4]} intensity={1.8} />
      {self?.role === 'hero' && <LocalHeroLoop />}
      {self?.role === 'hero' && <MouseAim />}
      {isMaster && <PossessLoop />}
      {isMaster && <LordLoop />}
      {isMaster && <LordActor />}
      {isMaster && <PossessAim />}
      {rooms.map((r) => (
        <RoomTile key={r.id} room={r} doors={doorsOf(s.rooms, r, isMaster)} draft={isMaster && !r.ready} />
      ))}
      {isMaster && <Slots s={s} />}
      {editRoom && <RoomEditor room={editRoom} />}
      {s.cinematic && <Entrance s={s} />}
      {summons.map((c) => (
        <group key={c.at} position={[c.x, 0, -c.y]}>
          <FxProgress get={() => Math.min(1, (performance.now() - c.at) / 800)}>{(p) => <SummonFx progress={p} />}</FxProgress>
        </group>
      ))}
      {watched && <ObserveTapper room={watched} s={s} />}
      {s.items
        .filter((i) => roomIds.has(i.room))
        .map((i) => (
          <group key={i.id} position={[i.x, 0, -i.y]}>
            {i.kind === 'chest' ? <Chest opened={i.opened} /> : <TrapItem phase={i.phase} />}
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
        const player = state.players.find((p) => p.id === h.id)
        const color = PLAYER_COLORS[player?.color ?? 0]
        const own = h.id === state.you
        if (h.dead) return null
        return <group key={h.id}>{own ? <OwnHero hero={h} color={color} /> : <OtherHero hero={h} color={color} />}</group>
      })}
      <HeroLabels />
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

