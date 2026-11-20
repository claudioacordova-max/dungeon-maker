import { me, useNet } from '../net/connection'
import { COST, HERO_HITS, ROOMS_TO_WIN, TEAM_LIVES } from '../shared/rules'
import type { Placeable } from '../shared/protocol'
import { useMaster } from '../game/master'
import { DoorIcon, ExitIcon, GemIcon, HeartIcon, SwordIcon } from './icons'
import { attack } from '../game/input'
import Joystick from './Joystick'
import { PLAYER_COLORS } from './screens'

// In-game HUD anchored to the stage edges. Heroes get the joystick; the master gets the build palette.
export default function Hud() {
  const state = useNet()
  const s = state.snapshot
  const self = me(state)
  if (!s || !self) return null
  const isMaster = self.role === 'master'

  return (
    <div className="hud">
      <div className="hud-corner hud-top-left panel hud-lives" role="group" aria-label={`Vidas del equipo: ${s.lives}`}>
        {Array.from({ length: TEAM_LIVES }, (_, i) => (
          <HeartIcon key={i} empty={i >= s.lives} />
        ))}
      </div>

      <div className="hud-top-center panel" role="group" aria-label={`Sala ${s.room} de ${ROOMS_TO_WIN}`}>
        <DoorIcon />
        <span className="hud-value">
          {s.room}/{ROOMS_TO_WIN}
        </span>
      </div>

      <div className="hud-corner hud-top-right">
        <span className="latency" aria-label={`Latencia: ${state.latency} ms`}>
          {state.latency > 0 ? `${state.latency} ms` : '…'}
        </span>
        <button type="button" className="ui-button ui-icon-button" aria-label="Salir de la partida" onClick={state.leave}>
          <ExitIcon />
        </button>
      </div>

      <ul className={isMaster ? 'party panel' : 'party panel party-hero-view'} aria-label="Héroes">
        {s.heroes.map((h) => {
          const player = state.players.find((p) => p.id === h.id)
          return (
            <li key={h.id} className={h.dead ? 'party-hero is-down' : 'party-hero'}>
              <span className="player-dot" style={{ background: PLAYER_COLORS[player?.color ?? 0] }} />
              <span className="party-name">{player?.name ?? '?'}</span>
              {h.dead ? (
                <span className="party-respawn">{h.respawnIn}s</span>
              ) : (
                <span className="hit-pips" aria-label={`${h.hp} de ${HERO_HITS} golpes`}>
                  {Array.from({ length: HERO_HITS }, (_, i) => (
                    <span key={i} className={i < h.hp ? 'pip' : 'pip is-empty'} />
                  ))}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {isMaster ? (
        <MasterPanel points={s.points} />
      ) : (
        <>
          <Joystick />
          <button
            type="button"
            className="attack-button"
            aria-label="Atacar"
            onPointerDown={(e) => {
              e.preventDefault()
              attack()
            }}
          >
            <SwordIcon />
          </button>
        </>
      )}
    </div>
  )
}

const TOOLS: { kind: Placeable | 'erase'; label: string }[] = [
  { kind: 'enemy', label: 'Enemigo' },
  { kind: 'trap', label: 'Trampa' },
  { kind: 'chest', label: 'Cofre' },
  { kind: 'erase', label: 'Quitar' },
]

function MasterPanel({ points }: { points: number }) {
  const view = useMaster((m) => m.view)
  const tool = useMaster((m) => m.tool)
  const setView = useMaster((m) => m.setView)
  const setTool = useMaster((m) => m.setTool)

  return (
    <div className="master-panel">
      <div className="master-top panel">
        <span className="master-points" role="group" aria-label={`Puntos: ${points}`}>
          <GemIcon />
          <span className="hud-value">{points}</span>
        </span>
        <button
          type="button"
          className="ui-button master-view"
          onClick={() => setView(view === 'next' ? 'current' : 'next')}
        >
          {view === 'next' ? 'Ver sala actual' : 'Preparar siguiente'}
        </button>
      </div>
      {view === 'next' && (
        <div className="palette" role="group" aria-label="Herramientas">
          {TOOLS.map((t) => (
            <button
              key={t.kind}
              type="button"
              className={tool === t.kind ? 'ui-button palette-tool is-selected' : 'ui-button palette-tool'}
              aria-pressed={tool === t.kind}
              disabled={t.kind !== 'erase' && points < COST[t.kind]}
              onClick={() => setTool(t.kind)}
            >
              <span>{t.label}</span>
              {t.kind !== 'erase' && <small className="palette-cost">{COST[t.kind]}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
