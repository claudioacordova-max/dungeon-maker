// The Maestro's controls, laid out where the thumbs fall (design "C · Mando del Maestro", 2026-11-21):
// - Map: the minimap at the bottom; "+" builds at once, a room opens for building or, with heroes, for watching.
// - Building a room: the difficulty meter on top, the terrain rail on the right edge (floor, spikes, chests), the
//   chosen enemy bottom-left (its list opens beside it) and a big "Sala lista" bottom-right, with Mapa above it.
// - Observar: the same places become the Maestro's powers: tap an enemy to control it (movement stick left,
//   attack right), "Invocar" summons a slime.
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { setAttackStick, setSpecialStick } from '../game/input'
import { useMaster } from '../game/master'
import { useNet } from '../net/connection'
import { layoutCost, SHAPE_NAME, SHAPES, type Layout } from '../shared/layouts'
import { canAdd, difficulty, roomAtPoint } from '../shared/map'
import type { EnemyView, Placeable, RoomView, Snapshot } from '../shared/protocol'
import { DIFFICULTY, MAX_ROOMS } from '../shared/rules'
import { MoveStick } from './Controls'
import MiniMap from './MiniMap'

const ENEMIES: { kind: Placeable; label: string }[] = [
  { kind: 'slime', label: 'Slime' },
  { kind: 'thrower', label: 'Lanzador' },
  { kind: 'ogre', label: 'Ogro' },
]
const NAME: Record<EnemyView['kind'], string> = { slime: 'Slime', thrower: 'Lanzador', ogre: 'Ogro', king: 'Jefe' }

const cost = (n: number) => (n > 0 ? `+${n}` : String(n))
const layoutOf = (room: RoomView): Layout => ({ shape: room.shape, spikes: room.spikes, chests: room.chests })

// A small drawn portrait of each enemy for the buttons (same colors as the models).
export function EnemyThumb({ kind }: { kind: Placeable | 'king' }) {
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
  const mode = useMaster((m) => m.mode)
  const roomId = useMaster((m) => m.room)
  const observe = useMaster((m) => m.observe)
  const pending = useMaster((m) => m.pending)
  const editRoom = useMaster((m) => m.editRoom)
  // A room just built opens for building as soon as the server confirms it.
  useEffect(() => {
    if (!pending) return
    const built = s.rooms.find((r) => r.gx === pending.gx && r.gy === pending.gy)
    if (built) (built.kind === 'normal' ? editRoom : observe)(built.id)
  }, [pending, s.rooms, editRoom, observe])
  // The boss entrance and the enemy under control take the Maestro to that room.
  const focus = s.cinematic?.room ?? s.enemies.find((e) => e.id === s.possessed)?.room ?? null
  useEffect(() => {
    if (focus !== null) observe(focus)
  }, [focus, observe])

  const room = s.rooms.find((r) => r.id === roomId)
  const waiting = s.introWaiting.length
  return (
    <>
      {waiting > 0 && (
        <div className="master-top intro-status">
          Los héroes leen la historia · listos {s.heroes.length - waiting}/{s.heroes.length}
        </div>
      )}
      {mode === 'room' && room ? <BuildControls s={s} room={room} /> : mode === 'observe' && room ? <ObserveControls s={s} room={room} /> : <MapPanel s={s} />}
    </>
  )
}

function MapPanel({ s }: { s: Snapshot }) {
  const bossPlaced = s.rooms.some((r) => r.kind === 'boss')
  const bossNext = s.normalRooms >= MAX_ROOMS
  return (
    <div className="master-panel panel">
      <MiniMap s={s} />
      <p className="master-note">
        {bossPlaced
          ? 'Mapa completo. Toca una sala con héroes para observarla.'
          : bossNext
            ? `Ya tienes ${MAX_ROOMS} salas: el + morado pone la sala del jefe.`
            : 'Toca un + para construir. Toca una sala para editarla, o una con héroes para observarla.'}
      </p>
    </div>
  )
}

// ---------- Building a room ----------

function BuildControls({ s, room }: { s: Snapshot; room: RoomView }) {
  const send = useNet((st) => st.send)
  const toMap = useMaster((m) => m.toMap)
  const observe = useMaster((m) => m.observe)
  const plan = room.plan ?? []
  const layout = layoutOf(room)
  const value = difficulty(plan, layout)
  const cap = s.cap
  const locked = room.entered || room.kind !== 'normal'
  // The ready button waits for the server's answer (a double tap must not undo it); editing a ready room asks first.
  const [awaiting, setAwaiting] = useState<boolean | null>(null)
  const [confirmEdit, setConfirmEdit] = useState(false)
  useEffect(() => {
    if (awaiting !== null && room.ready === awaiting) setAwaiting(null)
  }, [awaiting, room.ready])
  useEffect(() => {
    if (awaiting === null) return
    const t = setTimeout(() => setAwaiting(null), 2000)
    return () => clearTimeout(t)
  }, [awaiting])
  useEffect(() => setConfirmEdit(false), [room.id])

  const setReady = (ready: boolean) => {
    setAwaiting(ready)
    send({ type: 'ready', room: room.id, ready })
  }

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
      {locked ? (
        <div className="master-panel master-dock">
          <p className="master-note dock-note">Los héroes ya entraron: esta sala no se puede cambiar.</p>
          <div className="dock-right">
            <button type="button" className="ui-button small" onClick={toMap}>
              Mapa
            </button>
            <button type="button" className="ui-button ui-button-primary round-big" onClick={() => observe(room.id)}>
              Observar
            </button>
          </div>
        </div>
      ) : (
        <>
          {!room.ready && <TerrainRail room={room} cap={cap} maxChests={s.maxChests} />}
          <div className="master-panel master-dock">
            {room.ready ? <p className="master-note dock-note">Sala lista. Los héroes podrán entrar.</p> : <EnemyPicker room={room} cap={cap} />}
            <div className="dock-right">
              <div className="dock-small">
                {!room.ready && (
                  <button
                    type="button"
                    className="ui-button small danger"
                    onClick={() => {
                      send({ type: 'demolish', room: room.id })
                      toMap()
                    }}
                  >
                    Quitar
                  </button>
                )}
                <button type="button" className="ui-button small" onClick={toMap}>
                  Mapa
                </button>
              </div>
              {room.ready && confirmEdit ? (
                <div className="dock-confirm">
                  <span>¿Editarla?</span>
                  <button type="button" className="ui-button small danger" disabled={awaiting !== null} onClick={() => (setConfirmEdit(false), setReady(false))}>
                    Sí
                  </button>
                  <button type="button" className="ui-button small" onClick={() => setConfirmEdit(false)}>
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={room.ready ? 'ui-button round-big is-done' : 'ui-button ui-button-primary round-big'}
                  disabled={awaiting !== null}
                  onClick={() => (room.ready ? setConfirmEdit(true) : setReady(true))}
                >
                  {awaiting !== null ? '…' : room.ready ? 'Editar' : 'Sala lista'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// Right edge: floor shape (its list opens to the left), spikes on/off, chests (each tap adds one, back to 0).
function TerrainRail({ room, cap, maxChests }: { room: RoomView; cap: number; maxChests: number }) {
  const send = useNet((st) => st.send)
  const open = useMaster((m) => m.shapes)
  const setShapes = useMaster((m) => m.setShapes)
  const plan = room.plan ?? []
  const layout = layoutOf(room)
  const enemies = difficulty(plan, { shape: 'full', spikes: false, chests: 0 })
  // A change is offered when it fits (enemies over a gap the new shape opens are dropped by the server).
  const fits = (next: Layout) => enemies + layoutCost(next) <= cap || layoutCost(next) <= layoutCost(layout)
  const set = (next: Layout) => send({ type: 'layout', room: room.id, ...next })
  const nextChests = layout.chests >= maxChests ? 0 : layout.chests + 1
  return (
    <div className="master-rail" role="group" aria-label="Terreno">
      <button type="button" className={open ? 'rail-button is-open' : 'rail-button'} aria-expanded={open} onClick={() => setShapes(!open)}>
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
      {open && (
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

// Bottom-left: the chosen enemy; its list opens beside it (also by itself when the floor is tapped with none chosen).
function EnemyPicker({ room, cap }: { room: RoomView; cap: number }) {
  const send = useNet((st) => st.send)
  const tool = useMaster((m) => m.tool)
  const setTool = useMaster((m) => m.setTool)
  const open = useMaster((m) => m.picker)
  const cell = useMaster((m) => m.cell)
  const setPicker = useMaster((m) => m.setPicker)
  const plan = room.plan ?? []
  return (
    <div className="enemy-picker">
      <button
        type="button"
        className={tool ? 'enemy-current ui-button-primary' : 'enemy-current is-empty'}
        aria-expanded={open}
        aria-label={tool ? `Enemigo: ${ENEMIES.find((e) => e.kind === tool)?.label}. Cambiar` : 'Elegir enemigo'}
        onClick={() => setPicker(!open)}
      >
        {tool ? <EnemyThumb kind={tool} /> : <span className="enemy-plus">+</span>}
        <span>{tool ? ENEMIES.find((e) => e.kind === tool)?.label : 'Enemigo'}</span>
      </button>
      {open && (
        <div className="enemy-pop" role="group" aria-label="Enemigos">
          {ENEMIES.map((e) => (
            <button
              key={e.kind}
              type="button"
              className={tool === e.kind ? 'pop-tile is-current' : 'pop-tile'}
              disabled={!canAdd(plan, layoutOf(room), e.kind, cap)}
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
      {!open && <p className="picker-hint">{tool ? 'Toca el suelo para poner · toca un enemigo para quitarlo' : 'Toca el suelo para poner un enemigo'}</p>}
    </div>
  )
}

// ---------- Observar ----------

function ObserveControls({ s, room }: { s: Snapshot; room: RoomView }) {
  const send = useNet((st) => st.send)
  const toMap = useMaster((m) => m.toMap)
  const editRoom = useMaster((m) => m.editRoom)
  const held = s.enemies.find((e) => e.id === s.possessed)
  const heroesInside = s.heroes.some((h) => !h.dead && roomAtPoint(s.rooms, h.x, h.y)?.id === room.id)
  const fighting = heroesInside && room.enemies > 0
  const canBuild = room.kind === 'normal' && !room.entered && !heroesInside

  if (s.cinematic) return <div className="cinema-bars" aria-hidden="true" />

  if (held) {
    const boss = held.kind === 'king'
    return (
      <>
        <div className="master-top possess-tag">
          Controlas: <b>{NAME[held.kind]}</b>
          {held.chicken && ' (gallina)'}
        </div>
        <MoveStick />
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
              {boss && <MasterStick kind="special" label="Orbes" />}
              <MasterStick kind="attack" label={held.kind === 'king' ? 'Salto' : held.kind === 'slime' ? 'Embestir' : held.kind === 'ogre' ? 'Garrote' : 'Lanzar'} />
            </div>
          </div>
        </div>
      </>
    )
  }

  const summonReady = s.summonIn <= 0
  return (
    <>
      <div className="master-top observe-tag">
        Observando · {fighting ? 'toca un enemigo para controlarlo' : heroesInside ? 'sin enemigos' : 'no hay héroes aquí'}
      </div>
      <div className="master-panel master-dock">
        <p className="master-note dock-note">{room.kind === 'boss' ? 'Sala del jefe' : fighting ? 'Los héroes pelean aquí.' : ''}</p>
        <div className="dock-right">
          <div className="dock-small">
            {canBuild && (
              <button type="button" className="ui-button small" onClick={() => editRoom(room.id)}>
                Editar
              </button>
            )}
            <button type="button" className="ui-button small" onClick={toMap}>
              Mapa
            </button>
          </div>
          {room.kind !== 'boss' && (
            <button
              type="button"
              className="ui-button ui-button-boss round-big summon"
              disabled={!fighting || !summonReady}
              onClick={() => send({ type: 'summon', room: room.id })}
              aria-label="Invocar un slime"
            >
              <span>Invocar</span>
              <small>{summonReady ? 'slime' : `${Math.ceil(s.summonIn)} s`}</small>
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// The possessed enemy's buttons: tap = toward the nearest hero, drag = aim by hand, fired on release.
function MasterStick({ kind, label }: { kind: 'attack' | 'special'; label: string }) {
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
      className={`master-stick is-${kind}`}
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
