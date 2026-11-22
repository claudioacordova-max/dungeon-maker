// The Maestro's controls (designer, 2026-11-22). The Maestro moves its own body with the stick (bottom-left, like a
// hero); the room where it is decides the rest:
// - a room still being built: the difficulty on top; on the right edge a rail with the chosen enemy (its list opens to
//   the left; it also opens by itself when the floor is tapped with no enemy chosen), floor, spikes and chests; a big
//   "Sala lista" bottom-right;
// - a ready room: its powers. Tap an enemy to control it (the body turns into smoke and goes into it); "Invocar" and
//   then a tap on the floor summons a slime there;
// - a free spot next to a room: "Construir aquí".
// "Mapa" (above the big button) opens the map as a teleport.
import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent } from 'react'
import { setAttackStick, setSpecialStick } from '../game/input'
import { hereRoom, teleportLord } from '../game/lord'
import { heroesInside, isBuilding, useMaster } from '../game/master'
import { useNet } from '../net/connection'
import { layoutCost, SHAPE_NAME, SHAPES, type Layout } from '../shared/layouts'
import { buildableSlots, canAdd, difficulty } from '../shared/map'
import type { EnemyView, Placeable, RoomView, Snapshot } from '../shared/protocol'
import { DIFFICULTY, ENEMY, MAX_ROOMS, POSSESS } from '../shared/rules'
import { MoveStick } from './Controls'
import MiniMap from './MiniMap'
import { usePortraits } from './portraits'

const EnemyPortraits = lazy(() => import('./EnemyPortraits'))

const ENEMIES: { kind: Placeable; label: string }[] = [
  { kind: 'slime', label: 'Slime' },
  { kind: 'thrower', label: 'Lanzador' },
  { kind: 'ogre', label: 'Ogro' },
]
const NAME: Record<EnemyView['kind'], string> = { slime: 'Slime', thrower: 'Lanzador', ogre: 'Ogro', king: 'Jefe' }

const cost = (n: number) => (n > 0 ? `+${n}` : String(n))
const layoutOf = (room: RoomView): Layout => ({ shape: room.shape, spikes: room.spikes, chests: room.chests })

// A small picture of each enemy for the buttons, taken from its 3D model (a colored blob until it is ready).
export function EnemyThumb({ kind }: { kind: Placeable | 'king' }) {
  const url = usePortraits((p) => (kind === 'king' ? undefined : p.urls[kind]))
  if (url) return <img className="enemy-thumb-img" src={url} alt="" aria-hidden="true" />
  return <i className={`enemy-thumb is-${kind}`} aria-hidden="true" />
}

function ShapeIcon({ shape }: { shape: Layout['shape'] }) {
  const gaps: Record<Layout['shape'], string> = {
    full: '',
    banks: 'M0 0h5v10H0zM0 14h5v10H0zM15 0h5v10h-5zM15 14h5v10h-5z',
    cross: 'M0 0h6v6H0zM14 0h6v6h-6zM0 18h6v6H0zM14 18h6v6h-6z',
    bridge: 'M3.5 6h4v12h-4zM12.5 6h4v12h-4z',
  }
  return (
    <svg className="shape-icon" viewBox="0 0 20 24" aria-hidden="true">
      <rect width="20" height="24" rx="2" fill="#d8c3a5" />
      {gaps[shape] && <path d={gaps[shape]} fill="#1a0f2e" />}
    </svg>
  )
}

export default function MasterHud({ s }: { s: Snapshot }) {
  const here = useMaster((m) => m.here)
  const mapOpen = useMaster((m) => m.mapOpen)
  const portraitsDone = usePortraits((p) => p.done)
  const waiting = s.introWaiting.length
  const room = here ? hereRoom(s) : undefined
  const held = s.enemies.find((e) => e.id === s.possessed)

  let body
  if (s.cinematic) body = <div className="cinema-bars" aria-hidden="true" />
  else if (held) body = <PossessControls s={s} held={held} />
  else if (mapOpen) body = <TeleportMap s={s} />
  else if (room) body = isBuilding(s, room) ? <BuildControls s={s} room={room} /> : <PowerControls s={s} room={room} />
  else body = <FreeSpot s={s} />

  return (
    <>
      {!portraitsDone && (
        <Suspense fallback={null}>
          <EnemyPortraits />
        </Suspense>
      )}
      {waiting > 0 && (
        <div className="master-top intro-status">
          Los héroes leen la historia · listos {s.heroes.length - waiting}/{s.heroes.length}
        </div>
      )}
      {/* One movement stick for the body and for a possessed enemy: it must not be rebuilt when the room changes. */}
      {!s.cinematic && !mapOpen && <MoveStick />}
      {body}
    </>
  )
}

function MapButton() {
  const setMapOpen = useMaster((m) => m.setMapOpen)
  return (
    <button type="button" className="ui-button small" onClick={() => setMapOpen(true)}>
      Mapa
    </button>
  )
}

// The map as a teleport: tap a room (or a free spot) and the Maestro appears there.
function TeleportMap({ s }: { s: Snapshot }) {
  const setMapOpen = useMaster((m) => m.setMapOpen)
  return (
    <div className="master-panel panel">
      <MiniMap
        s={s}
        onPick={(gx, gy) => {
          teleportLord(gx, gy)
          setMapOpen(false)
        }}
      />
      <div className="master-row teleport-row">
        <p className="master-note">Toca una sala para aparecer en ella.</p>
        <button type="button" className="ui-button small" onClick={() => setMapOpen(false)}>
          Cerrar
        </button>
      </div>
    </div>
  )
}

// A free spot next to a room: build here (the boss room once the normal rooms are done).
function FreeSpot({ s }: { s: Snapshot }) {
  const send = useNet((st) => st.send)
  const here = useMaster((m) => m.here)
  const bossPlaced = s.rooms.some((r) => r.kind === 'boss')
  const buildable = !!here && !bossPlaced && buildableSlots(s.rooms).some((sl) => sl.gx === here.gx && sl.gy === here.gy)
  const bossNext = s.normalRooms >= MAX_ROOMS
  return (
    <>
      {buildable && <div className="master-top observe-tag">{bossNext ? 'Aquí puede ir la sala del jefe' : 'Espacio libre para una sala'}</div>}
      <div className="master-panel master-dock">
        <span />
        <div className="dock-right">
          <div className="dock-small">
            <MapButton />
          </div>
          {buildable && (
            <button
              type="button"
              className={bossNext ? 'ui-button ui-button-boss round-big' : 'ui-button ui-button-primary round-big'}
              onClick={() => {
                if (!here) return
                send({ type: 'build', gx: here.gx, gy: here.gy, kind: bossNext ? 'boss' : 'normal' })
                useMaster.getState().setBuildView(true)
              }}
            >
              {bossNext ? 'Sala del jefe' : 'Construir aquí'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ---------- Building a room ----------

function BuildControls({ s, room }: { s: Snapshot; room: RoomView }) {
  const send = useNet((st) => st.send)
  const plan = room.plan ?? []
  const value = difficulty(plan, layoutOf(room))
  const cap = s.cap
  // The ready button waits for the server's answer (a double tap must not undo it).
  const [awaiting, setAwaiting] = useState(false)
  useEffect(() => {
    if (!awaiting) return
    const t = setTimeout(() => setAwaiting(false), 2000)
    return () => clearTimeout(t)
  }, [awaiting])
  return (
    <>
      <div className="master-top master-meter" aria-label={`Dificultad ${value} de ${cap}`}>
        <span>
          Dificultad <b>{value}</b>/{cap}
        </span>
        <span className="meter-bar meter-thin" aria-hidden="true">
          <i style={{ width: `${Math.max(0, Math.min(1, value / cap)) * 100}%` }} />
        </span>
      </div>
      <BuildRail room={room} cap={cap} maxChests={s.maxChests} />
      <div className="master-panel master-dock">
        <span />
        <div className="dock-right">
          <div className="dock-small">
            <button type="button" className="ui-button small danger" onClick={() => send({ type: 'demolish', room: room.id })}>
              Quitar
            </button>
            <MapButton />
          </div>
          <button
            type="button"
            className="ui-button ui-button-primary round-big"
            disabled={awaiting}
            onClick={() => {
              setAwaiting(true)
              send({ type: 'ready', room: room.id, ready: true })
            }}
          >
            {awaiting ? '…' : 'Sala lista'}
          </button>
        </div>
      </div>
    </>
  )
}

// Right edge: the chosen enemy (its list opens to the left), floor shape, spikes on/off, chests (each tap adds one).
function BuildRail({ room, cap, maxChests }: { room: RoomView; cap: number; maxChests: number }) {
  const send = useNet((st) => st.send)
  const shapesOpen = useMaster((m) => m.shapes)
  const setShapes = useMaster((m) => m.setShapes)
  const tool = useMaster((m) => m.tool)
  const setTool = useMaster((m) => m.setTool)
  const pickerOpen = useMaster((m) => m.picker)
  const cell = useMaster((m) => m.cell)
  const setPicker = useMaster((m) => m.setPicker)
  const plan = room.plan ?? []
  const layout = layoutOf(room)
  const enemies = difficulty(plan, { shape: 'full', spikes: false, chests: 0 })
  // A change is offered when it fits (enemies over a gap the new shape opens are dropped by the server).
  const fits = (next: Layout) => enemies + layoutCost(next) <= cap || layoutCost(next) <= layoutCost(layout)
  const set = (next: Layout) => {
    useMaster.getState().setBuildView(true)
    send({ type: 'layout', room: room.id, ...next })
  }
  const nextChests = layout.chests >= maxChests ? 0 : layout.chests + 1
  const label = ENEMIES.find((e) => e.kind === tool)?.label
  return (
    <div className="master-rail" role="group" aria-label="Construir">
      <button
        type="button"
        className={tool ? 'rail-button rail-enemy is-on' : 'rail-button rail-enemy'}
        aria-expanded={pickerOpen}
        aria-label={tool ? `Enemigo: ${label}. Cambiar` : 'Elegir enemigo'}
        onClick={() => setPicker(!pickerOpen)}
      >
        {tool ? <EnemyThumb kind={tool} /> : <span className="enemy-plus">+</span>}
        <span>{tool ? label : 'Enemigo'}</span>
        {tool && <small>{cost(DIFFICULTY[tool])}</small>}
      </button>
      <button type="button" className={shapesOpen ? 'rail-button is-open' : 'rail-button'} aria-expanded={shapesOpen} onClick={() => setShapes(!shapesOpen)}>
        <ShapeIcon shape={layout.shape} />
        <span>{SHAPE_NAME[layout.shape]}</span>
        <small>{layout.shape === 'full' ? '0' : cost(DIFFICULTY.brokenFloor)}</small>
      </button>
      <button
        type="button"
        className={layout.spikes ? 'rail-button is-on' : 'rail-button'}
        aria-pressed={layout.spikes}
        disabled={!layout.spikes && !fits({ ...layout, spikes: true })}
        onClick={() => set({ ...layout, spikes: !layout.spikes })}
      >
        <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 20l3-9 3 9 3-9 3 9 3-9 3 9z" fill="currentColor" />
        </svg>
        <span>Pinchos</span>
        <small>{cost(DIFFICULTY.spikes)}</small>
      </button>
      <button
        type="button"
        className={layout.chests > 0 ? 'rail-button is-on' : 'rail-button'}
        aria-label={`Cofres: ${layout.chests} de ${maxChests}. Tocar para cambiar`}
        disabled={!fits({ ...layout, chests: nextChests })}
        onClick={() => set({ ...layout, chests: nextChests })}
      >
        <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 10a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v9H3z" fill="#b45309" stroke="#1a0f2e" strokeWidth="1.6" />
          <path d="M3 11h18M11 11v4h2v-4" stroke="#fcd34d" strokeWidth="1.8" fill="none" />
        </svg>
        <span>Cofres</span>
        <small>{cost(DIFFICULTY.chest)}</small>
        <b className="rail-badge">{layout.chests}</b>
      </button>
      {pickerOpen && (
        <div className="rail-pop enemy-list" role="group" aria-label="Enemigos">
          {ENEMIES.map((e) => (
            <button
              key={e.kind}
              type="button"
              className={tool === e.kind ? 'pop-tile is-current' : 'pop-tile'}
              disabled={!canAdd(plan, layout, e.kind, cap)}
              onClick={() => {
                setTool(e.kind)
                if (cell) send({ type: 'place', room: room.id, kind: e.kind, cx: cell.cx, cy: cell.cy })
                setPicker(false)
              }}
            >
              <EnemyThumb kind={e.kind} />
              <span>{e.label}</span>
              <small>{cost(DIFFICULTY[e.kind])}</small>
            </button>
          ))}
        </div>
      )}
      {shapesOpen && (
        <div className="rail-pop" role="group" aria-label="Forma del suelo">
          {SHAPES.map((shape) => {
            const next = { ...layout, shape }
            return (
              <button
                key={shape}
                type="button"
                className={layout.shape === shape ? 'pop-tile is-current' : 'pop-tile'}
                aria-pressed={layout.shape === shape}
                disabled={layout.shape !== shape && !fits(next)}
                onClick={() => {
                  set(next)
                  setShapes(false)
                }}
              >
                <ShapeIcon shape={shape} />
                <span>{SHAPE_NAME[shape]}</span>
                <small>{shape === 'full' ? '0' : cost(DIFFICULTY.brokenFloor)}</small>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- Powers (a ready room) ----------

function PowerControls({ s, room }: { s: Snapshot; room: RoomView }) {
  const send = useNet((st) => st.send)
  const summoning = useMaster((m) => m.summoning)
  const setSummoning = useMaster((m) => m.setSummoning)
  const canEdit = room.kind === 'normal' && !room.entered && !heroesInside(s, room)
  const ready = s.summonIn <= 0
  const hint =
    room.kind === 'boss'
      ? 'Sala del jefe: lo controlarás cuando entren los héroes'
      : summoning
        ? 'Toca el suelo donde aparecerá el slime (lejos de los héroes)'
        : room.enemies > 0
          ? 'Toca un enemigo para controlarlo'
          : 'Sala sin enemigos'
  return (
    <>
      <div className={summoning ? 'master-top observe-tag is-armed' : 'master-top observe-tag'}>{hint}</div>
      <div className="master-panel master-dock">
        <span />
        <div className="dock-right">
          <div className="dock-small">
            {canEdit && (
              <button type="button" className="ui-button small" onClick={() => send({ type: 'ready', room: room.id, ready: false })}>
                Editar
              </button>
            )}
            <MapButton />
          </div>
          {room.kind !== 'boss' && room.ready && (
            <button
              type="button"
              className={summoning ? 'ui-button round-big summon is-armed' : 'ui-button ui-button-boss round-big summon'}
              disabled={!ready && !summoning}
              onClick={() => setSummoning(!summoning)}
              aria-label="Invocar un slime"
            >
              <span>{summoning ? 'Cancelar' : 'Invocar'}</span>
              <small>{summoning ? 'toca el suelo' : ready ? 'slime' : `${Math.ceil(s.summonIn)} s`}</small>
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ---------- Controlling an enemy ----------

// Full wait of each attack, for the ring on its button.
function fullWait(kind: EnemyView['kind'], button: 'attack' | 'special') {
  if (kind === 'king') return button === 'attack' ? ENEMY.king.jumpEvery : ENEMY.king.fanEvery
  if (kind === 'slime') return POSSESS.dashCooldown
  if (kind === 'ogre') return ENEMY.ogre.cooldown
  return ENEMY.thrower.cooldown
}

function PossessControls({ s, held }: { s: Snapshot; held: EnemyView }) {
  const send = useNet((st) => st.send)
  const boss = held.kind === 'king'
  const wait = s.possessedWait ?? { attack: 0, special: 0 }
  const ring = (button: 'attack' | 'special') => Math.max(0, Math.min(1, (button === 'attack' ? wait.attack : wait.special) / fullWait(held.kind, button)))
  return (
    <>
      <div className="master-top possess-tag">
        Controlas: <b>{NAME[held.kind]}</b>
        {held.chicken && ' (gallina)'}
      </div>
      <div className="master-panel master-dock is-possess">
        <span />
        <div className="dock-right">
          {!boss && (
            <div className="dock-small">
              <button type="button" className="ui-button small" onClick={() => send({ type: 'release' })}>
                Soltar
              </button>
            </div>
          )}
          <div className="possess-buttons">
            {boss && <MasterStick kind="special" label="Orbes" wait={ring('special')} />}
            <MasterStick
              kind="attack"
              label={held.kind === 'king' ? 'Salto' : held.kind === 'slime' ? 'Embestir' : held.kind === 'ogre' ? 'Garrote' : 'Lanzar'}
              wait={ring('attack')}
            />
          </div>
        </div>
      </div>
    </>
  )
}

// The possessed enemy's buttons: tap = toward the nearest hero, drag = aim by hand, fired on release. A dark ring
// shows how long until the attack is ready again.
function MasterStick({ kind, label, wait }: { kind: 'attack' | 'special'; label: string; wait: number }) {
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const pointer = useRef<number | null>(null)
  const set = kind === 'attack' ? setAttackStick : setSpecialStick
  const last = useRef({ aiming: false, dir: 0 })
  useEffect(() => () => set(false, false, 0), [set])

  function update(e: PointerEvent) {
    const el = base.current!
    const rect = el.getBoundingClientRect()
    const scale = rect.width / Number(el.dataset.width)
    const dx = (e.clientX - (rect.left + rect.width / 2)) / scale
    const dy = (e.clientY - (rect.top + rect.height / 2)) / scale
    const len = Math.hypot(dx, dy)
    const k = Math.min(1, 34 / Math.max(len, 1))
    if (knob.current) knob.current.style.transform = `translate(calc(${dx * k} * var(--ui-px)), calc(${dy * k} * var(--ui-px)))`
    last.current = { aiming: len > 24, dir: Math.atan2(-dy, dx) }
    set(true, last.current.aiming, last.current.dir)
  }
  function release() {
    pointer.current = null
    if (knob.current) knob.current.style.transform = ''
    set(false, last.current.aiming, last.current.dir)
    last.current = { aiming: false, dir: 0 }
  }
  return (
    <div
      ref={base}
      className={wait > 0 ? `master-stick is-${kind} is-waiting` : `master-stick is-${kind}`}
      style={{ ['--wait' as string]: String(wait) }}
      data-width={kind === 'attack' ? 118 : 86}
      role="button"
      aria-label={label}
      onPointerDown={(e) => {
        pointer.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        update(e)
      }}
      onPointerMove={(e) => pointer.current === e.pointerId && update(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div ref={knob} className="master-knob">
        {label}
      </div>
    </div>
  )
}
