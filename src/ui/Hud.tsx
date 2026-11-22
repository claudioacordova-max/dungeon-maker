import { useEffect, useRef, useState } from 'react'
import { me, useNet } from '../net/connection'
import { MAX_ROOMS } from '../shared/rules'
import { AttackStick, MoveStick, SpecialStick } from './Controls'
import MasterHud from './MasterHud'
import SoundToggle from './SoundToggle'
import EntrancePick from './EntrancePick'
import { ExitIcon, HeartIcon, PassiveIcon, PotionIcon, SkullIcon } from './icons'
import { PASSIVE_INFO, PLAYER_COLORS } from './screens'

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
        {isMaster ? (
          <div className="chip kills" aria-label={`Héroes derrotados: ${s.kills}`}>
            <SkullIcon />
            <b>{s.kills}</b>
          </div>
        ) : (
        <div className="chip lives" role="group" aria-label={`Vidas del equipo: ${s.lives}. Pociones: ${s.potions}`}>
          {Array.from({ length: s.maxLives }, (_, i) => (
            <HeartIcon key={i} empty={i >= s.lives} />
          ))}
          <span className="potions" aria-label={`Pociones del equipo: ${s.potions}`}>
            <PotionIcon />
            <b>{s.potions}</b>
          </span>
          {own?.passive && <PassiveChip id={own.passive} boons={own.boons} />}
        </div>
        )}
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
      ) : s.introWaiting.length > 0 && own ? (
        <EntrancePick s={s} own={own} />
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
      {own && <PotionFlash drinks={own.drinks} />}
    </div>
  )
}

// The own hero's passive, small next to the potions; it bounces when the passive triggers.
function PassiveChip({ id, boons }: { id: keyof typeof PASSIVE_INFO; boons: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef(boons)
  useEffect(() => {
    if (boons === last.current) return
    last.current = boons
    const el = ref.current
    if (!el) return
    el.classList.remove('is-active')
    void el.offsetWidth
    el.classList.add('is-active')
  }, [boons])
  return (
    <span ref={ref} className="passive-chip" title={PASSIVE_INFO[id].name} aria-label={`Pasiva: ${PASSIVE_INFO[id].name}`}>
      <PassiveIcon id={id} />
    </span>
  )
}

// A pink glow around the screen edges when the own hero drinks a potion.
function PotionFlash({ drinks }: { drinks: number }) {
  const [flash, setFlash] = useState(0)
  const last = useRef(drinks)
  useEffect(() => {
    if (drinks === last.current) return
    last.current = drinks
    setFlash((f) => f + 1)
  }, [drinks])
  return flash > 0 ? <div key={flash} className="potion-flash" aria-hidden="true" /> : null
}
