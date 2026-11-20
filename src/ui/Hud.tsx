import { useEffect } from 'react'
import { useMaster } from '../game/master'
import { me, useNet } from '../net/connection'
import { canAdd, difficulty } from '../shared/map'
import type { Placeable, Snapshot } from '../shared/protocol'
import { DIFFICULTY, MAX_ROOMS, ROOM_DIFFICULTY_CAP, TEAM_LIVES } from '../shared/rules'
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
            <AttackStick melee={own.cls === 'melee'} />
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
  { kind: 'trap', label: 'Trampa' },
  { kind: 'chest', label: 'Cofre' },
]

function MasterPanel({ s }: { s: Snapshot }) {
  const send = useNet((st) => st.send)
  const mode = useMaster((m) => m.mode)
  const roomId = useMaster((m) => m.room)
  const tool = useMaster((m) => m.tool)
  const slot = useMaster((m) => m.slot)
  const setTool = useMaster((m) => m.setTool)
  const setSlot = useMaster((m) => m.setSlot)
  const toMap = useMaster((m) => m.toMap)
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
    const value = difficulty(plan)
    const locked = room.entered || room.kind === 'start'
    return (
      <div className="master-panel panel">
        <div className="master-row">
          <button type="button" className="ui-button small" onClick={toMap}>
            Mapa
          </button>
          <div className="meter" aria-label={`Dificultad ${value} de ${ROOM_DIFFICULTY_CAP}`}>
            <span className="meter-label">{room.kind === 'boss' ? 'Sala del jefe' : 'Dificultad'}</span>
            <span className="meter-bar">
              <i style={{ width: `${Math.max(0, Math.min(1, value / ROOM_DIFFICULTY_CAP)) * 100}%` }} />
            </span>
            <b>
              {value}/{ROOM_DIFFICULTY_CAP}
            </b>
          </div>
        </div>
        {locked ? (
          <p className="master-note">Los héroes ya entraron: esta sala no se puede cambiar.</p>
        ) : (
          <>
            <div className="palette" role="group" aria-label="Elementos">
              {TOOLS.map((t) => (
                <button
                  key={t.kind}
                  type="button"
                  className={tool === t.kind ? 'ui-button tool is-selected' : 'ui-button tool'}
                  aria-pressed={tool === t.kind}
                  disabled={!canAdd(plan, t.kind)}
                  onClick={() => setTool(t.kind)}
                >
                  <span>{t.label}</span>
                  <small>{DIFFICULTY[t.kind] > 0 ? `+${DIFFICULTY[t.kind]}` : DIFFICULTY[t.kind]}</small>
                </button>
              ))}
            </div>
            <div className="master-row">
              <button
                type="button"
                className={room.ready ? 'ui-button small' : 'ui-button ui-button-primary small'}
                onClick={() => send({ type: 'ready', room: room.id, ready: !room.ready })}
              >
                {room.ready ? 'Volver a editar' : 'Sala lista'}
              </button>
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
            <p className="master-note">Toca una casilla para poner {TOOLS.find((t) => t.kind === tool)?.label.toLowerCase()}; tócala de nuevo para quitarlo.</p>
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
