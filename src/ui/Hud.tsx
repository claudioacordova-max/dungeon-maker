import { useState } from 'react'
import { me, useNet } from '../net/connection'
import { MAX_ROOMS } from '../shared/rules'
import { AttackStick, MoveStick, SpecialStick } from './Controls'
import MasterHud from './MasterHud'
import SoundToggle from './SoundToggle'
import { ExitIcon, HeartIcon, PotionIcon } from './icons'
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
          {Array.from({ length: s.maxLives }, (_, i) => (
            <HeartIcon key={i} empty={i >= s.lives} />
          ))}
        </div>
        <div className="chip potions" aria-label={`Pociones del equipo: ${s.potions}`}>
          <PotionIcon />
          <b>{s.potions}</b>
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

      {!isMaster && (
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
      )}

      {isMaster ? (
        <MasterHud s={s} />
      ) : s.introWaiting.length > 0 ? (
        <Intro waiting={s.introWaiting} you={state.you} total={s.heroes.length} />
      ) : s.cinematic ? (
        <div className="cinema-bars" aria-hidden="true" />
      ) : (
        own &&
        !own.dead && (
          <>
            <MoveStick />
            <AttackStick cls={own.cls} />
            {(own.cls === 'priest' || own.cls === 'mage') && <SpecialStick cls={own.cls} />}
            <p className="desktop-hint">
              WASD mover · Clic atacar
              {own.cls === 'priest' || own.cls === 'mage' ? ' · Clic derecho especial' : ' · Mantén para cargar'}
            </p>
          </>
        )
      )}
      {own?.dead && <div className="down-banner">Reapareciendo…</div>}
    </div>
  )
}

// The story the heroes read at the start while the Maestro begins to build (fixed text, designer 2026-11-21).
function Intro({ waiting, you, total }: { waiting: string[]; you: string | null; total: number }) {
  const send = useNet((st) => st.send)
  const [pressed, setPressed] = useState(false)
  const done = pressed || (you !== null && !waiting.includes(you))
  return (
    <div className="intro" role="dialog" aria-label="Historia">
      <div className="intro-card panel">
        <h2>La mazmorra despierta</h2>
        <p>Bajo la montaña, el Maestro de la mazmorra levanta sus salas una a una, y cada una guarda un peligro nuevo.</p>
        <p>Nadie que haya entrado ha vuelto a salir. Ustedes son los primeros en intentarlo juntos: crucen sus salas, sobrevivan a sus trampas y derroten a su guardián.</p>
        <p className="intro-last">El Maestro ya los está mirando.</p>
        {done ? (
          <p className="intro-wait">
            Esperando a los demás héroes · {total - waiting.length}/{total}
          </p>
        ) : (
          <button
            type="button"
            className="ui-button ui-button-primary"
            onClick={() => {
              setPressed(true)
              send({ type: 'introReady' })
            }}
          >
            Entrar a la mazmorra
          </button>
        )}
      </div>
    </div>
  )
}
