import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Group, MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { SHAPES, type RoomShape } from '../shared/layouts'
import type { SpikePhase } from '../shared/protocol'
import { ROOM_H, ROOM_W } from '../shared/rules'
import { MeleeHero, RangedHero } from './Heroes'
import { PriestHero, MageHero } from './Spellcasters'
import { Ogre, Chicken } from './Creatures'
import { PreviewMagic, type MagicExhibit } from './MagicEffects'
import { Slime, SlimeKing, Thrower } from './Enemies'
import { MasterLord, PreviewMasterFade } from './Master'
import { Chest, RoomShell, SpikeTrap } from './Dungeon'
import { Bedrock, UnbuiltLot } from './Ground'
import { BlobShadow, EnemyOrb, HeroBolt, PreviewStroke } from './Effects'
import { bake, box, toon } from './kit'
import { makePose, type Anim, type Pose } from './types'
import './showcase.css'

type Name = 'Swordsman' | 'Ranger' | 'Priestess' | 'Mage' | 'Ogre' | 'Chicken' | 'Thrower' | 'Slime' |
  'Slime King' | 'Maestro' | 'Dissolve' | 'Chest' | 'Spikes' | 'Bolts' | 'Orb' | 'Slash' | 'Spin' |
  'Unbuilt lot' | 'Boss lot' | MagicExhibit
type Exhibit = { name: Name; x: number; z: number; labelOffset: number; anims?: Anim[]; width?: number; height?: number; possessed?: boolean }
function pair(entry: Omit<Exhibit,'x'>): Exhibit[] {
  return [{ ...entry, x: .25 }, { ...entry, x: .75, possessed: true }]
}
const exhibitTitle = (entry: Exhibit) => entry.possessed ? 'Possessed ' + entry.name : entry.name
const heroClips: Anim[] = ['idle', 'run', 'attack', 'charge', 'special', 'hurt', 'die']
const smallClips: Anim[] = ['idle','run','hurt','die']
const pages = ['Heroes','Dungeon','Maestro','Floors','Combat','Magic'] as const
type Page = typeof pages[number]
const rooms: Record<Page, Exhibit[]> = {
  Heroes: [
    { name: 'Swordsman', x: .27, z: .74, labelOffset: .40, anims: heroClips },
    { name: 'Ranger', x: .73, z: .74, labelOffset: .40, anims: heroClips },
    { name: 'Priestess', x: .27, z: .30, labelOffset: .42, anims: heroClips },
    { name: 'Mage', x: .73, z: .30, labelOffset: .42, anims: heroClips },
  ],
  Dungeon: [
    ...pair({ name: 'Slime King', z: .87, labelOffset: .98, anims: ['idle','run','windup','jump','land','throw','hurt','die'], width: 3.45, height: .72 }),
    ...pair({ name: 'Ogre', z: .60, labelOffset: .77, anims: ['idle','run','windup','land','hurt','die'], width: 2.85, height: .86 }),
    ...pair({ name: 'Thrower', z: .39, labelOffset: .39, anims: ['idle','run','windup','throw','hurt','die'] }),
    ...pair({ name: 'Slime', z: .23, labelOffset: .40, anims: smallClips }),
    { name: 'Chest', x: .19, z: .085, labelOffset: .53 },
    { name: 'Chicken', x: .50, z: .085, labelOffset: .27, anims: smallClips, width: 1.12, height: .23 },
    { name: 'Spikes', x: .81, z: .085, labelOffset: .50, anims: ['idle','trigger'] },
  ],
  Maestro: [
    { name: 'Maestro', x: .26, z: .73, labelOffset: .65, anims: ['idle','special','attack'], width: 2.34, height: .77 },
    { name: 'Dissolve', x: .74, z: .73, labelOffset: .65, width: 2.34, height: .77 },
    { name: 'Possess smoke', x: .28, z: .34, labelOffset: .86, width: 3.18, height: .82 },
    { name: 'Summon', x: .76, z: .37, labelOffset: .60, width: 1.86, height: .14 },
    { name: 'Potion', x: .65, z: .12, labelOffset: .47, width: 1.90, height: .52 },
  ],
  Floors: [
    { name: 'Spikes', x: .5, z: .5, labelOffset: .65, width: 2.1, height: .30 },
    { name: 'Unbuilt lot', x: .5, z: -.5, labelOffset: 2.2 },
    { name: 'Boss lot', x: .5, z: 1.5, labelOffset: 2.2 },
  ],
  Combat: [
    { name: 'Bolts', x: .27, z: .74, labelOffset: .48 }, { name: 'Orb', x: .73, z: .74, labelOffset: .48 },
    { name: 'Slash', x: .27, z: .30, labelOffset: .55 }, { name: 'Spin', x: .73, z: .30, labelOffset: .55 },
  ],
  Magic: [
    { name: 'Light orb', x: .27, z: .79, labelOffset: .42 }, { name: 'Fire spark', x: .73, z: .79, labelOffset: .42 },
    { name: 'Poly bolt', x: .27, z: .50, labelOffset: .42 }, { name: 'Burn', x: .73, z: .50, labelOffset: .48 },
    { name: 'Heal', x: .27, z: .20, labelOffset: .58 }, { name: 'Poof', x: .73, z: .20, labelOffset: .48 },
  ],
}
const isLot = (name: Name) => name === 'Unbuilt lot' || name === 'Boss lot'
const floorsAcross = rooms.Floors.map(e => ({ ...e, x: 1 - e.z, z: .5 }))
const doors = { n: 'closed', s: 'none', e: 'locked', w: 'open' } as const
const interval = 1.55
type Playback = { t: number; paused: boolean; focus: number }
type LabelRefs = RefObject<(HTMLButtonElement | null)[]>
const plinth = bake([
  { g: box, c: '#643e52', p: [0, -.20, 0], s: [1, .37, 1] },
  { g: box, c: '#aa714e', p: [0, -.31, 0], s: [.994, .048, .994] },
  { g: box, c: '#3b304a', p: [0, -.42, 0], s: [.95, .12, .95] },
], 0).color

function FrameScene({ play, labels, w, h, exhibits }: { play: Playback; labels: LabelRefs; w: number; h: number; exhibits: Exhibit[] }) {
  const camera = useThree(s => s.camera) as PerspectiveCamera
  const size = useThree(s => s.size)
  const project = useMemo(() => new Vector3(), [])
  const lastFocus = useRef(-2)
  useLayoutEffect(() => { lastFocus.current = -2 }, [size, w, h, exhibits])
  useFrame((_, dt) => {
    if (!play.paused) play.t += Math.min(dt, .1)
    if (lastFocus.current === play.focus) return
    lastFocus.current = play.focus
    const exhibit = exhibits[play.focus]
    const targetX = exhibit ? exhibit.x * w : w / 2
    const targetZ = exhibit ? -exhibit.z * h : -h / 2
    const targetY = exhibit ? (exhibit.height ?? .43) : .22
    const tilt = MathUtils.degToRad(50)
    function place(distance: number) {
      camera.position.set(targetX, targetY + Math.sin(tilt) * distance, targetZ + Math.cos(tilt) * distance)
      camera.lookAt(targetX, targetY, targetZ)
      camera.updateMatrixWorld()
    }
    if (exhibit && !isLot(exhibit.name)) {
      if (camera.view?.enabled) camera.clearViewOffset()
      const subjectWidth = exhibit.width ?? 1.8
      place(Math.max(subjectWidth / camera.aspect, subjectWidth * .93) / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2))))
    } else {
      // Fit all eight corners, including the front corners closest to the lens.
      const lots = exhibits.filter(e => isLot(e.name))
      const centers = exhibit ? [exhibit] : [{ x: .5, z: .5 }, ...lots]
      const x0 = (Math.min(...centers.map(e => e.x)) - .5) * w
      const x1 = (Math.max(...centers.map(e => e.x)) + .5) * w
      const z0 = -(Math.max(...centers.map(e => e.z)) + .5) * h
      const z1 = -(Math.min(...centers.map(e => e.z)) - .5) * h
      let near = 3, far = lots.length ? 180 : 60
      const heading = size.height < 540 ? 53 : 76
      const controls = size.height < 540 ? 106 : 126
      const top = 1 - 2*heading/size.height, bottom = -1 + 2*controls/size.height
      camera.setViewOffset(size.width,size.height,0,(controls-heading)/2,size.width,size.height)
      for (let i = 0; i < 14; i++) {
        const distance = (near + far) / 2
        place(distance)
        let fits = true
        for (const x of [x0 - .67, x1 + .67]) for (const z of [z0 - .59, z1 + .60]) for (const y of [-.55, 1.35]) {
          project.set(x, y, z).project(camera)
          if (Math.abs(project.x) > .95 || project.y > top || project.y < bottom) fits = false
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

function Display({ entry, i, play, w, h, labels, phase }: {
  entry: Exhibit; i: number; play: Playback; w: number; h: number; labels: LabelRefs; phase?: SpikePhase
}) {
  const { name, x, z, anims } = entry
  const pose = useMemo(makePose, [])
  const exhibit = useRef<Group>(null)
  const motion = useRef<Group>(null)
  const shut = useRef<Group>(null), open = useRef<Group>(null)
  const lastLabel = useRef('')
  useLayoutEffect(() => { pose.t = 0 }, [pose, phase])
  useFrame((_, dt) => {
    exhibit.current!.visible = play.focus < 0 || play.focus === i
    const step = Math.floor(play.t / interval), t = play.t % interval
    const anim = anims?.[step % anims.length] ?? 'idle'
    pose.anim = anim
    pose.t = phase ? pose.t + Math.min(dt, .1) : t
    pose.charge = Math.min(1, t / .85)
    pose.flash = anim === 'hurt' ? Math.max(0, 1 - t * 4.6) : 0
    let label: string = (name === 'Spikes' && phase) || (anims ? anim : '')
    if (name === 'Chest') {
      const opened = step % 2 === 1
      shut.current!.visible = !opened
      open.current!.visible = opened
      label = opened ? 'open' : 'closed'
    }
    if (label !== lastLabel.current) {
      const el = labels.current[i]?.lastElementChild
      if (el) { el.textContent = label; lastLabel.current = label }
    }
    if (name === 'Slime King' && motion.current) motion.current.position.y = anim === 'jump' ? .39 + .11 * Math.sin(t * 5) : 0
    if (motion.current && (name === 'Bolts' || name === 'Orb' || name === 'Light orb' || name === 'Fire spark' || name === 'Poly bolt')) {
      motion.current.position.y = .38 + .055 * Math.sin(play.t * 4)
      motion.current.rotation.y = name === 'Orb' ? play.t * 2 : -.61
    }
  }, -2)
  return <group ref={exhibit} name={exhibitTitle(entry)} position={[x * w, 0, -z * h]}
    onClick={e => { e.stopPropagation(); labels.current[i]?.click() }}>
    <group ref={motion}>
      <Model name={name} possessed={entry.possessed} pose={pose} play={play} shut={shut} open={open} phase={phase} />
    </group>
  </group>
}

function Model({ name, possessed, pose, play, shut, open, phase }: {
  name: Name; possessed?: boolean; pose: Pose; play: Playback; shut: RefObject<Group | null>; open: RefObject<Group | null>; phase?: SpikePhase
}) {
  switch (name) {
    case 'Unbuilt lot': return <UnbuiltLot />
    case 'Boss lot': return <UnbuiltLot boss />
    case 'Swordsman': return <group rotation-y={2.72}><MeleeHero pose={pose} tint="#ff6b59" /></group>
    case 'Ranger': return <group rotation-y={3.59}><RangedHero pose={pose} tint="#56e7bf" /></group>
    case 'Priestess': return <group rotation-y={3.48}><PriestHero pose={pose} tint="#45d2bc" /></group>
    case 'Mage': return <group rotation-y={3.43}><MageHero pose={pose} tint="#db68af" /></group>
    case 'Maestro': return <group rotation-y={3.31}><MasterLord pose={pose} /></group>
    case 'Dissolve': return <group rotation-y={3.04}><PreviewMasterFade pose={pose} /></group>
    case 'Ogre': return <group rotation-y={3.58}><Ogre pose={pose} possessed={possessed} /></group>
    case 'Chicken': return <group rotation-y={2.59}><Chicken pose={pose} /></group>
    case 'Thrower': return <group rotation-y={3.46}><Thrower pose={pose} possessed={possessed} /></group>
    case 'Slime': return <group rotation-y={2.92}><Slime pose={pose} possessed={possessed} /></group>
    case 'Slime King': return <group rotation-y={3.38}><SlimeKing pose={pose} possessed={possessed} /></group>
    case 'Chest': return <group rotation-y={3.44}>
      <group ref={shut}><Chest opened={false} /></group>
      <group ref={open} visible={false}><Chest opened /></group>
    </group>
    case 'Bolts': return <group>
      <group position-x={-.14}><HeroBolt crit={false} /></group>
      <group position-x={.14}><HeroBolt crit /></group>
    </group>
    case 'Orb': return <EnemyOrb />
    case 'Spikes': return <SpikeTrap pose={pose} phase={phase} />
    case 'Slash': case 'Spin': return <PreviewStroke time={play} spin={name === 'Spin'} />
    default: return <PreviewMagic name={name} clock={play} />
  }
}

function Diorama({ play, labels, page, shape, phase }: {
  play: Playback; labels: LabelRefs; page: Page; shape: RoomShape; phase: SpikePhase
}) {
  const size = useThree(s => s.size)
  const wide = size.width > size.height
  const floors = page === 'Floors'
  const w = floors ? ROOM_W : page === 'Dungeon' ? 6 : 4
  const h = floors ? ROOM_H : page === 'Dungeon' ? 14 : wide ? 5 : 6
  const exhibits = floors && wide ? floorsAcross : rooms[page]
  return <>
    <FrameScene play={play} labels={labels} w={w} h={h} exhibits={exhibits} />
    <ambientLight color="#e8e2ff" intensity={1.08} />
    <directionalLight position={[-5, 8, 4]} color="#fff0d2" intensity={2.55} />
    {floors && <Bedrock minX={-6*w} maxX={7*w} minZ={-5*h} maxZ={4*h} />}
    {!floors && <>
      <group position={[w / 2 + .13, -.59, -h / 2 + .19]} scale={[w * .82, 1, h * .92]}>
        <BlobShadow radius={1} />
      </group>
      <mesh geometry={plinth} material={toon} position={[w / 2, -.028, -h / 2]} scale={[w + .85, 1, h + .85]} dispose={null} />
    </>}
    <RoomShell w={w} h={h} doors={doors} shape={floors ? shape : 'full'} />
    {exhibits.map((e, i) => <Display key={exhibitTitle(e)} entry={e} i={i} w={w} h={h} play={play} labels={labels} phase={floors ? phase : undefined} />)}
  </>
}

export default function Showcase() {
  const [page, setPage] = useState<Page>('Heroes')
  const [shape, setShape] = useState<RoomShape>('banks')
  const [phase, setPhase] = useState<SpikePhase>('down')
  const exhibits = rooms[page]
  const play = useMemo<Playback>(() => ({ t: 0, paused: false, focus: -1 }), [])
  const labels = useRef<(HTMLButtonElement | null)[]>([])
  const [focusIndex, setFocusIndex] = useState(-1)
  function focus(i: number) {
    play.focus = i
    setFocusIndex(i)
  }
  return <main data-focused={focusIndex !== -1} className="dm-gallery" aria-label="Dungeon Maker model showcase">
    <Canvas dpr={[1, 2]} camera={{ fov: 30, near: .1, far: 240 }} gl={{ antialias: true, alpha: true }}>
      <Diorama play={play} labels={labels} page={page} shape={shape} phase={phase} />
    </Canvas>
    <header className="dm-gallery-title">
      <div className="dm-crest" aria-hidden="true"><i /></div>
      <div><div className="dm-wordmark">Dungeon Maker</div><h1>Model showcase</h1></div>
    </header>
    <div className="dm-marker-layer">
      {exhibits.map((e, i) => <button type="button" className="dm-marker" key={exhibitTitle(e)}
        ref={el => { labels.current[i] = el }} aria-label={'Inspect ' + exhibitTitle(e)}
        onClick={() => focus(play.focus === i ? -1 : i)}>
        <strong>{exhibitTitle(e)}</strong><small>{e.anims ? 'idle' : e.name === 'Chest' ? 'closed' : ''}</small>
      </button>)}
    </div>
    <div className="dm-playback">
      <div className="dm-transport dm-rooms" role="group" aria-label="Exhibit rooms">
        {pages.map(room => <button type="button" key={room} style={{ paddingInline: 'clamp(5px, 1.6vw, 16px)' }} aria-pressed={page === room} onClick={() => {
          if (page === room) return
          focus(-1)
          play.t = .17
          setPage(room)
        }}>{room}</button>)}
      </div>
      <div className="dm-playback-row">
        <button type="button" className="dm-back" hidden={focusIndex === -1} onClick={() => focus(-1)}>
          {page === 'Floors' ? 'Room view' : 'All models'}
        </button>
        {page === 'Floors' && <>
          <div className="dm-transport dm-shapes" role="group" aria-label="Floor shape">
            {SHAPES.map(s => <button type="button" key={s} aria-pressed={shape === s} onClick={() => setShape(s)}>{s}</button>)}
          </div>
          <div className="dm-transport dm-phases" hidden={focusIndex >= 0 && exhibits[focusIndex]?.name !== 'Spikes'} role="group" aria-label="Spike phase">
            {(['down', 'warn', 'up'] as const).map(p =>
              <button type="button" key={p} aria-pressed={phase === p} onClick={() => setPhase(p)}>{p}</button>)}
          </div>
        </>}
        <div className="dm-transport" hidden={page === 'Floors'}>
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
    </div>
  </main>
}
