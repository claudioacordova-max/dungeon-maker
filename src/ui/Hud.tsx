import { useEffect, useState } from 'react'
import { useMaster } from '../game/master'
import { me, useNet } from '../net/connection'
import { layoutCost, SHAPE_NAME, SHAPES, type Layout } from '../shared/layouts'
import { canAdd, difficulty } from '../shared/map'
import type { Placeable, RoomView, Snapshot } from '../shared/protocol'
import { DIFFICULTY, MAX_CHESTS, MAX_ROOMS, TEAM_LIVES } from '../shared/rules'
import { AttackStick, MoveStick } from './Controls'
import MiniMap from './MiniMap'
import SoundToggle from './SoundToggle'
import { ExitIcon, HeartIcon } from './icons'
import { PLAYER_COLORS } from './screens'

// In-game HUD over the scene. Heroes: lives, party and the two sticks. Master: map counters and build tools.
export default function Hud() {
  const state = useNet()
  const s = state.snapshot
  const self = me(state)
  if (!s || !self) return null
  const isMaster = self.role === 'master'
  const own = s.heroes.find((h) => h.id === state.you)

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="chip lives" role="group" aria-label={`Vidas del equipo: ${s.lives}`}>
          {Array.from({ length: TEAM_LIVES }, (_, i) => (
            <HeartIcon key={i} empty={i >= s.lives} />
          ))}
        </div>
        <div className="chip rooms" aria-label={`Habitaciones ${s.normalRooms} de ${MAX_ROOMS}`}>
          <span className="chip-label">Salas</span>
          <b>
            {s.normalRooms}/{MAX_ROOMS}
          </b>
          {s.rooms.some((r) => r.kind === 'boss') && <span className="boss-tag">Jefe</span>}
        </div>
        <div className="hud-top-right">
          <span className="latency">{state.latency > 0 ? `${state.latency} ms` : ''}</span>
          <SoundToggle />
          <button type="button" className="ui-button ui-icon-button exit" aria-label="Salir de la partida" onClick={state.leave}>
            <ExitIcon />
          </button>
        </div>
      </div>

      <ul className="party" aria-label="Héroes">
        {s.heroes.map((h) => {
          const player = state.players.find((p) => p.id === h.id)
          return (
            <li key={h.id} className={h.dead ? 'party-hero is-down' : 'party-hero'}>
              <span className="player-dot" style={{ background: PLAYER_COLORS[player?.color ?? 0] }} />
              <span className="party-name">{player?.name ?? '?'}</span>
              {h.dead && <span className="party-respawn">{h.respawnIn}s</span>}
            </li>
          )
        })}
      </ul>

      {isMaster ? (
        <MasterPanel s={s} />
      ) : (
        own &&
        !own.dead && (
          <>
            <MoveStick />
            <AttackStick cls={own.cls} />
          </>
        )
      )}
      {own?.dead && <div className="down-banner">Reapareciendo…</div>}
    </div>
  )
}

const TOOLS: { kind: Placeable; label: string }[] = [
  { kind: 'slime', label: 'Slime' },
  { kind: 'thrower', label: 'Lanzador' },
  { kind: 'ogre', label: 'Ogro' },
]

const cost = (n: number) => (n > 0 ? `+${n}` : String(n))
const layoutOf = (room: RoomView): Layout => ({ shape: room.shape, spikes: room.spikes, chests: room.chests })

// "Sala" tab: floor shape, spike pack and chests; the whole layout is sent at once and checked by the server.
function LayoutTab({ room, cap }: { room: RoomView; cap: number }) {
  const send = useNet((st) => st.send)
  const plan = room.plan ?? []
  const layout = layoutOf(room)
  const enemies = difficulty(plan, { shape: 'full', spikes: false, chests: 0 })
  // A change is offered when it fits: enemies over a gap the new shape opens are dropped by the server.
  const fits = (next: Layout) => enemies + layoutCost(next) <= cap || layoutCost(next) <= layoutCost(layout)
  const set = (next: Layout) => send({ type: 'layout', room: room.id, ...next })
  return (
    <>
      <div className="palette palette-4" role="group" aria-label="Forma del suelo">
        {SHAPES.map((shape) => {
          const next = { ...layout, shape }
          return (
            <button
              key={shape}
              type="button"
              className={layout.shape === shape ? 'ui-button tool is-selected' : 'ui-button tool'}
              aria-pressed={layout.shape === shape}
              disabled={layout.shape !== shape && !fits(next)}
              onClick={() => set(next)}
            >
              <ShapeIcon shape={shape} />
              <span>{SHAPE_NAME[shape]}</span>
              <small>{shape === 'full' ? '0' : cost(DIFFICULTY.brokenFloor)}</small>
            </button>
          )
        })}
      </div>
      <div className="master-row layout-row">
        <button
          type="button"
          className={layout.spikes ? 'ui-button small is-on' : 'ui-button small'}
          aria-pressed={layout.spikes}
          disabled={!layout.spikes && !fits({ ...layout, spikes: true })}
          onClick={() => set({ ...layout, spikes: !layout.spikes })}
        >
          Pinchos {layout.spikes ? 'sí' : 'no'} <small>{cost(DIFFICULTY.spikes)}</small>
        </button>
        <div className="stepper" role="group" aria-label={`Cofres: ${layout.chests}`}>
          <button
            type="button"
            className="ui-button small"
            aria-label="Un cofre menos"
            disabled={layout.chests === 0 || !fits({ ...layout, chests: layout.chests - 1 })}
            onClick={() => set({ ...layout, chests: layout.chests - 1 })}
          >
            −
          </button>
          <span>
            Cofres <b>{layout.chests}</b> <small>{cost(DIFFICULTY.chest)} c/u</small>
          </span>
          <button
            type="button"
            className="ui-button small"
            aria-label="Un cofre más"
            disabled={layout.chests >= MAX_CHESTS}
            onClick={() => set({ ...layout, chests: layout.chests + 1 })}
          >
            +
          </button>
        </div>
      </div>
    </>
  )
}

// Small top view of a floor shape for its button.
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

function MasterPanel({ s }: { s: Snapshot }) {
  const send = useNet((st) => st.send)
  const mode = useMaster((m) => m.mode)
  const roomId = useMaster((m) => m.room)
  const tool = useMaster((m) => m.tool)
  const slot = useMaster((m) => m.slot)
  const setTool = useMaster((m) => m.setTool)
  const setSlot = useMaster((m) => m.setSlot)
  const toMap = useMaster((m) => m.toMap)
  const tab = useMaster((m) => m.tab)
  const setTab = useMaster((m) => m.setTab)
  // The ready button waits for the server's answer (a double tap must not undo it), and going back to editing
  // a ready room asks first.
  const [awaiting, setAwaiting] = useState<{ room: number; ready: boolean } | null>(null)
  const [confirmEdit, setConfirmEdit] = useState(false)
  const current = s.rooms.find((r) => r.id === roomId)
  useEffect(() => {
    if (awaiting && current && current.id === awaiting.room && current.ready === awaiting.ready) setAwaiting(null)
  }, [awaiting, current])
  useEffect(() => {
    if (!awaiting) return
    const t = setTimeout(() => setAwaiting(null), 2000)
    return () => clearTimeout(t)
  }, [awaiting])
  useEffect(() => setConfirmEdit(false), [roomId])
  const pending = useMaster((m) => m.pending)
  const setPending = useMaster((m) => m.setPending)
  const editRoom = useMaster((m) => m.editRoom)
  // A room just built opens for editing as soon as the server confirms it.
  useEffect(() => {
    if (!pending) return
    const built = s.rooms.find((r) => r.gx === pending.gx && r.gy === pending.gy)
    if (built) editRoom(built.id)
  }, [pending, s.rooms, editRoom])
  const room = s.rooms.find((r) => r.id === roomId)
  const bossPlaced = s.rooms.some((r) => r.kind === 'boss')
  const bossNext = s.normalRooms >= MAX_ROOMS

  if (mode === 'room' && room) {
    const plan = room.plan ?? []
    const cap = s.cap
    const value = difficulty(plan, layoutOf(room))
    const locked = room.entered || room.kind === 'start'
    return (
      <div className="master-panel panel">
        <div className="master-row">
          <button type="button" className="ui-button small" onClick={toMap}>
            Mapa
          </button>
          <div className="meter" aria-label={`Dificultad ${value} de ${cap}`}>
            <span className="meter-label">{room.kind === 'boss' ? 'Sala del jefe' : 'Dificultad'}</span>
            <span className="meter-bar">
              <i style={{ width: `${Math.max(0, Math.min(1, value / cap)) * 100}%` }} />
            </span>
            <b>
              {value}/{cap}
            </b>
          </div>
        </div>
        {locked ? (
          <p className="master-note">Los héroes ya entraron: esta sala no se puede cambiar.</p>
        ) : (
          <>
            <div className="master-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'room'} className={tab === 'room' ? 'tab is-active' : 'tab'} onClick={() => setTab('room')}>
                Sala
              </button>
              <button type="button" role="tab" aria-selected={tab === 'enemies'} className={tab === 'enemies' ? 'tab is-active' : 'tab'} onClick={() => setTab('enemies')}>
                Enemigos
              </button>
            </div>
            {tab === 'room' ? (
              <LayoutTab room={room} cap={cap} />
            ) : (
            <div className="palette" role="group" aria-label="Enemigos">
              {TOOLS.map((t) => (
                <button
                  key={t.kind}
                  type="button"
                  className={tool === t.kind ? 'ui-button tool is-selected' : 'ui-button tool'}
                  aria-pressed={tool === t.kind}
                  disabled={!canAdd(plan, layoutOf(room), t.kind, cap)}
                  onClick={() => setTool(t.kind)}
                >
                  <span>{t.label}</span>
                  <small>{cost(DIFFICULTY[t.kind])}</small>
                </button>
              ))}
            </div>
            )}
            <div className="master-row">
              {room.ready && confirmEdit ? (
                <>
                  <button
                    type="button"
                    className="ui-button small danger"
                    disabled={!!awaiting}
                    onClick={() => {
                      setAwaiting({ room: room.id, ready: false })
                      setConfirmEdit(false)
                      send({ type: 'ready', room: room.id, ready: false })
                    }}
                  >
                    Sí, editar
                  </button>
                  <button type="button" className="ui-button small" onClick={() => setConfirmEdit(false)}>
                    No
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={room.ready ? 'ui-button small' : 'ui-button ui-button-primary small'}
                  disabled={!!awaiting}
                  onClick={() => {
                    if (room.ready) setConfirmEdit(true)
                    else {
                      setAwaiting({ room: room.id, ready: true })
                      send({ type: 'ready', room: room.id, ready: true })
                    }
                  }}
                >
                  {awaiting ? '…' : room.ready ? 'Volver a editar' : 'Sala lista'}
                </button>
              )}
              {!room.ready && (
                <button
                  type="button"
                  className="ui-button small danger"
                  onClick={() => {
                    send({ type: 'demolish', room: room.id })
                    toMap()
                  }}
                >
                  Quitar sala
                </button>
              )}
            </div>
            {room.kind === 'boss' && <p className="master-note">El jefe aparece cuando caen los enemigos de esta sala.</p>}
            {tab === 'enemies' && (
              <p className="master-note">Toca el suelo para poner {TOOLS.find((t) => t.kind === tool)?.label.toLowerCase()}; tócalo de nuevo para quitarlo.</p>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="master-panel panel">
      <MiniMap s={s} />
      {slot && !bossPlaced ? (
        <div className="master-row">
          {!bossNext ? (
            <button
              type="button"
              className="ui-button ui-button-primary small"
              onClick={() => {
                send({ type: 'build', gx: slot.gx, gy: slot.gy, kind: 'normal' })
                setPending(slot)
                setSlot(null)
              }}
            >
              Construir sala
            </button>
          ) : (
            <button
              type="button"
              className="ui-button ui-button-boss small"
              onClick={() => {
                send({ type: 'build', gx: slot.gx, gy: slot.gy, kind: 'boss' })
                setPending(slot)
                setSlot(null)
              }}
            >
              Sala del jefe
            </button>
          )}
          <button type="button" className="ui-button small" onClick={() => setSlot(null)}>
            Cancelar
          </button>
        </div>
      ) : (
        <p className="master-note">
          {bossPlaced
            ? 'Mapa completo. Toca una sala para revisarla.'
            : bossNext
              ? 'Ya tienes 6 salas: toca un + morado para la sala del jefe.'
              : 'Toca un + para construir una sala, o una sala para editarla.'}
        </p>
      )}
    </div>
  )
}
