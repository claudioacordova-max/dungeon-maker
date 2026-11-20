import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Group, MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { MeleeHero, RangedHero } from './Heroes'
import { Slime, SlimeKing, Thrower } from './Enemies'
import { Chest, RoomShell, SpikeTrap } from './Dungeon'
import { BlobShadow, EnemyOrb, HeroBolt, PreviewStroke } from './Effects'
import { bake, box, toon } from './kit'
import { makePose, type Anim, type Pose } from './types'
import './showcase.css'

type Exhibit = { name: string; x: number; z: number; labelOffset: number; anims?: Anim[] }
const heroClips: Anim[] = ['idle', 'run', 'attack', 'charge', 'special', 'hurt', 'die']
const exhibits: Exhibit[] = [
  { name: 'Warrior', x: .18, z: .85, labelOffset: .40, anims: heroClips },
  { name: 'Ranger', x: .50, z: .85, labelOffset: .40, anims: heroClips },
  { name: 'Thrower', x: .82, z: .85, labelOffset: .40, anims: ['idle', 'run', 'windup', 'throw', 'hurt', 'die'] },
  { name: 'Slime', x: .16, z: .49, labelOffset: .46, anims: ['idle', 'run', 'hurt', 'die'] },
  { name: 'Slime King', x: .50, z: .47, labelOffset: 1.04, anims: ['idle', 'run', 'windup', 'jump', 'land', 'throw', 'hurt', 'die'] },
  { name: 'Chest', x: .84, z: .49, labelOffset: .55 },
  { name: 'Bolts', x: .105, z: .17, labelOffset: .48 },
  { name: 'Orb', x: .30, z: .17, labelOffset: .48 },
  { name: 'Spikes', x: .495, z: .17, labelOffset: .48, anims: ['idle', 'trigger'] },
  { name: 'Slash', x: .69, z: .17, labelOffset: .48 },
  { name: 'Spin', x: .89, z: .17, labelOffset: .48 },
]
const doors = { n: 'closed', s: 'none', e: 'locked', w: 'open' } as const
const interval = 1.55
type Playback = { t: number; paused: boolean; focus: number }
type LabelRefs = RefObject<(HTMLButtonElement | null)[]>
const plinth = bake([
  { g: box, c: '#643e52', p: [0, -.20, 0], s: [1, .37, 1] },
  { g: box, c: '#aa714e', p: [0, -.31, 0], s: [.994, .048, .994] },
  { g: box, c: '#3b304a', p: [0, -.42, 0], s: [.95, .12, .95] },
], 0).color

function FrameScene({ play, labels, w, h }: { play: Playback; labels: LabelRefs; w: number; h: number }) {
  const camera = useThree(s => s.camera) as PerspectiveCamera
  const size = useThree(s => s.size)
  const project = useMemo(() => new Vector3(), [])
  const lastFocus = useRef(-2)
  useLayoutEffect(() => { lastFocus.current = -2 }, [size, w, h])
  useFrame((_, dt) => {
    if (!play.paused) play.t += Math.min(dt, .1)
    if (lastFocus.current === play.focus) return
    lastFocus.current = play.focus
    const exhibit = exhibits[play.focus]
    const targetX = exhibit ? exhibit.x * w : w / 2
    const targetZ = exhibit ? -exhibit.z * h : -h / 2
    const targetY = exhibit ? (play.focus === 4 ? .72 : .43) : .22
    const tilt = MathUtils.degToRad(50)
    function place(distance: number) {
      camera.position.set(targetX, targetY + Math.sin(tilt) * distance, targetZ + Math.cos(tilt) * distance)
      camera.lookAt(targetX, targetY, targetZ)
      camera.updateMatrixWorld()
    }
    if (exhibit) {
      const subjectWidth = play.focus === 4 ? 4.15 : 2.55
      place(Math.max(subjectWidth / camera.aspect, subjectWidth * .93) / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2))))
    } else {
      // Fit all eight corners, including the front corners closest to the lens.
      let near = 3, far = 60
      const top = 1 - Math.min(.45, 2 * (size.height < 540 ? 53 : 86) / size.height)
      for (let i = 0; i < 14; i++) {
        const distance = (near + far) / 2
        place(distance)
        let fits = true
        for (const x of [-.67, w + .67]) for (const z of [-h - .59, .60]) for (const y of [-.55, 1.35]) {
          project.set(x, y, z).project(camera)
          if (Math.abs(project.x) > .95 || Math.abs(project.y) > top) fits = false
        }
        if (fits) far = distance
        else near = distance
      }
      place(far)
    }
    for (let i = 0; i < exhibits.length; i++) {
      const el = labels.current[i], entry = exhibits[i]
      if (!el) continue
      el.hidden = !!exhibit && play.focus !== i
      if (el.hidden) continue
      project.set(entry.x * w, .02, -entry.z * h + entry.labelOffset).project(camera)
      el.style.left = (50 + project.x * 50) + '%'
      el.style.top = (50 - project.y * 50) + '%'
    }
  }, -3)
  return null
}

function Display({ i, play, w, h, labels }: { i: number; play: Playback; w: number; h: number; labels: LabelRefs }) {
  const { x, z, anims } = exhibits[i]
  const pose = useMemo(makePose, [])
  const exhibit = useRef<Group>(null)
  const motion = useRef<Group>(null)
  const shut = useRef<Group>(null), open = useRef<Group>(null)
  const lastLabel = useRef('')
  useFrame(() => {
    exhibit.current!.visible = play.focus < 0 || play.focus === i
    const step = Math.floor(play.t / interval), t = play.t % interval
    const anim = anims?.[step % anims.length] ?? 'idle'
    pose.anim = anim
    pose.t = t
    pose.charge = Math.min(1, t / .85)
    pose.flash = anim === 'hurt' ? Math.max(0, 1 - t * 4.6) : 0
    let label: string = anims ? anim : ''
    if (i === 5) {
      const opened = step % 2 === 1
      shut.current!.visible = !opened
      open.current!.visible = opened
      label = opened ? 'open' : 'closed'
    }
    if (label !== lastLabel.current) {
      const el = labels.current[i]?.lastElementChild
      if (el) { el.textContent = label; lastLabel.current = label }
    }
    if (i === 4 && motion.current) motion.current.position.y = anim === 'jump' ? .39 + .11 * Math.sin(t * 5) : 0
    if ((i === 6 || i === 7) && motion.current) {
      motion.current.position.y = .38 + .055 * Math.sin(play.t * 4)
      if (i === 7) motion.current.rotation.y = play.t * 2
    }
  }, -2)
  return <group ref={exhibit} name={exhibits[i].name} position={[x * w, 0, -z * h]}
    onClick={e => { e.stopPropagation(); labels.current[i]?.click() }}>
    <group ref={motion}>
      <Model i={i} pose={pose} play={play} shut={shut} open={open} />
    </group>
  </group>
}

function Model({ i, pose, play, shut, open }: {
  i: number; pose: Pose; play: Playback; shut: RefObject<Group | null>; open: RefObject<Group | null>
}) {
  switch (i) {
    case 0: return <group rotation-y={2.72}><MeleeHero pose={pose} tint="#ff6b59" /></group>
    case 1: return <group rotation-y={3.59}><RangedHero pose={pose} tint="#56e7bf" /></group>
    case 2: return <group rotation-y={3.46}><Thrower pose={pose} /></group>
    case 3: return <group rotation-y={2.92}><Slime pose={pose} /></group>
    case 4: return <group rotation-y={3.38}><SlimeKing pose={pose} /></group>
    case 5: return <group rotation-y={3.44}>
      <group ref={shut}><Chest opened={false} /></group>
      <group ref={open} visible={false}><Chest opened /></group>
    </group>
    case 6: return <group rotation-y={-.61}>
      <group position-x={-.14}><HeroBolt crit={false} /></group>
      <group position-x={.14}><HeroBolt crit /></group>
    </group>
    case 7: return <EnemyOrb />
    case 8: return <SpikeTrap pose={pose} />
    default: return <PreviewStroke time={play} spin={i === 10} />
  }
}

function Diorama({ play, labels }: { play: Playback; labels: LabelRefs }) {
  const size = useThree(s => s.size)
  const wide = size.width > size.height
  const w = wide ? 9 : 6, h = wide ? 7 : 10
  return <>
    <FrameScene play={play} labels={labels} w={w} h={h} />
    <ambientLight color="#e8e2ff" intensity={1.08} />
    <directionalLight position={[-5, 8, 4]} color="#fff0d2" intensity={2.55} />
    <group position={[w / 2 + .13, -.59, -h / 2 + .19]} scale={[w * .82, 1, h * .92]}>
      <BlobShadow radius={1} />
    </group>
    <mesh geometry={plinth} material={toon} position={[w / 2, -.028, -h / 2]} scale={[w + .85, 1, h + .85]} dispose={null} />
    <RoomShell w={w} h={h} doors={doors} />
    {exhibits.map((e, i) => <Display key={e.name} i={i} w={w} h={h} play={play} labels={labels} />)}
  </>
}

export default function Showcase() {
  const play = useMemo<Playback>(() => ({ t: 0, paused: false, focus: -1 }), [])
  const labels = useRef<(HTMLButtonElement | null)[]>([])
  const overview = useRef<HTMLButtonElement>(null)
  const gallery = useRef<HTMLElement>(null)
  function focus(i: number) {
    play.focus = i
    if (overview.current) overview.current.hidden = i === -1
    if (gallery.current) gallery.current.dataset.focused = String(i !== -1)
  }
  return <main ref={gallery} className="dm-gallery" aria-label="Dungeon Maker model showcase">
    <Canvas dpr={[1, 2]} camera={{ fov: 30, near: .1, far: 100 }} gl={{ antialias: true, alpha: true }}>
      <Diorama play={play} labels={labels} />
    </Canvas>
    <header className="dm-gallery-title">
      <div className="dm-crest" aria-hidden="true"><i /></div>
      <div><div className="dm-wordmark">Dungeon Maker</div><h1>Model showcase</h1></div>
    </header>
    <div className="dm-marker-layer">
      {exhibits.map((e, i) => <button type="button" className="dm-marker" key={e.name}
        ref={el => { labels.current[i] = el }} aria-label={'Inspect ' + e.name}
        onClick={() => focus(play.focus === i ? -1 : i)}>
        <strong>{e.name}</strong><small>{e.anims ? 'idle' : i === 5 ? 'closed' : ''}</small>
      </button>)}
    </div>
    <div className="dm-playback">
      <button type="button" className="dm-back" hidden ref={overview} onClick={() => focus(-1)}>All models</button>
      <div className="dm-transport">
        <button type="button" aria-pressed="false" onClick={e => {
          play.paused = !play.paused
          e.currentTarget.setAttribute('aria-pressed', String(play.paused))
          e.currentTarget.lastElementChild!.textContent = play.paused ? 'Play' : 'Pause'
        }}><i className="dm-pause-icon" aria-hidden="true" /><span>Pause</span></button>
        <button type="button" onClick={() => { play.t = (Math.floor(play.t / interval) + 1) * interval + .17 }}>
          <i className="dm-next-icon" aria-hidden="true" /><span>Next pose</span>
        </button>
      </div>
    </div>
  </main>
}
