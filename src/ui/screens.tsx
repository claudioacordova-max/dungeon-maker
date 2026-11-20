import { useState, type ReactNode } from 'react'
import { me, useNet } from '../net/connection'
import type { HeroClass } from '../shared/protocol'
import { MAX_HEROES } from '../shared/rules'
import { BowIcon, CrownIcon, SwordIcon } from './icons'

function Screen({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className="screen" aria-label={label}>
      <div className={wide ? 'screen-panel panel is-wide' : 'screen-panel panel'}>{children}</div>
    </section>
  )
}

export const PLAYER_COLORS = ['#38bdf8', '#f472b6', '#facc15', '#a3e635', '#fb923c']

const CLASSES: { cls: HeroClass; name: string; role: string }[] = [
  { cls: 'melee', name: 'Espadachín', role: 'Cuerpo a cuerpo' },
  { cls: 'ranged', name: 'Arquera', role: 'A distancia' },
]

function Logo() {
  return (
    <h1 className="logo">
      <span>Dungeon</span>
      <span>Maker</span>
    </h1>
  )
}

export function HomeScreen() {
  const name = useNet((s) => s.name)
  const error = useNet((s) => s.error)
  const setName = useNet((s) => s.setName)
  const createRoom = useNet((s) => s.createRoom)
  const joinRoom = useNet((s) => s.joinRoom)
  const [code, setCode] = useState('')
  const validCode = /^[A-Za-z]{4}$/.test(code)
  const hasName = name.trim().length > 0

  return (
    <Screen label="Inicio">
      <Logo />
      <label className="field">
        <span className="field-label">Tu nombre</span>
        <input className="field-input" value={name} maxLength={16} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="button" className="ui-button ui-button-primary big" disabled={!hasName} onClick={createRoom}>
        Crear sala
      </button>
      <div className="join-row">
        <input
          className="field-input code-input"
          value={code}
          maxLength={4}
          placeholder="CÓDIGO"
          autoComplete="off"
          autoCapitalize="characters"
          aria-label="Código de sala"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
        />
        <button type="button" className="ui-button" disabled={!hasName || !validCode} onClick={() => joinRoom(code)}>
          Entrar
        </button>
      </div>
      {error && <p className="screen-error">{error}</p>}
    </Screen>
  )
}

export function ConnectingScreen() {
  return (
    <Screen label="Conectando">
      <p className="screen-hint">Conectando…</p>
    </Screen>
  )
}

export function LobbyScreen() {
  const state = useNet()
  const self = me(state)
  const isHost = state.you === state.host
  const master = state.players.find((p) => p.role === 'master')
  const heroes = state.players.filter((p) => p.role === 'hero')
  const canStart = isHost && !!master && heroes.length >= 1 && heroes.length <= MAX_HEROES

  return (
    <Screen label="Sala" wide>
      <div className="lobby-head">
        <span className="field-label">Código de la sala</span>
        <span className="lobby-code">{state.code}</span>
      </div>
      {state.notice && <p className="screen-error">{state.notice}</p>}
      <ul className="lobby-list">
        {state.players.map((p) => (
          <li key={p.id} className={p.id === state.you ? 'lobby-player is-you' : 'lobby-player'}>
            <span className="player-dot" style={{ background: PLAYER_COLORS[p.color] }} />
            <span className="lobby-name">{p.name}</span>
            <span className="lobby-role">
              {p.role === 'master' ? (
                <>
                  <CrownIcon /> Máster
                </>
              ) : p.cls === 'melee' ? (
                <>
                  <SwordIcon /> Espadachín
                </>
              ) : (
                <>
                  <BowIcon /> Arquera
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {self?.role === 'hero' && (
        <div className="class-pick" role="group" aria-label="Clase">
          {CLASSES.map((c) => (
            <button
              key={c.cls}
              type="button"
              className={self.cls === c.cls ? 'class-card is-selected' : 'class-card'}
              aria-pressed={self.cls === c.cls}
              onClick={() => state.send({ type: 'class', cls: c.cls })}
            >
              <span className="class-icon">{c.cls === 'melee' ? <SwordIcon /> : <BowIcon />}</span>
              <b>{c.name}</b>
              <small>{c.role}</small>
            </button>
          ))}
        </div>
      )}
      <div className="lobby-actions">
        {self?.role === 'hero' ? (
          <button type="button" className="ui-button" disabled={!!master} onClick={() => state.send({ type: 'role', role: 'master' })}>
            Ser el máster
          </button>
        ) : (
          <button type="button" className="ui-button" onClick={() => state.send({ type: 'role', role: 'hero' })}>
            Ser héroe
          </button>
        )}
        {isHost ? (
          <button type="button" className="ui-button ui-button-primary" disabled={!canStart} onClick={() => state.send({ type: 'start' })}>
            Empezar
          </button>
        ) : (
          <span className="screen-hint">El anfitrión empieza.</span>
        )}
      </div>
      {isHost && !canStart && <p className="screen-hint">Hace falta un máster y al menos un héroe.</p>}
      <button type="button" className="ui-button small ghost" onClick={state.leave}>
        Salir
      </button>
    </Screen>
  )
}

export function EndScreen() {
  const phase = useNet((s) => s.phase)
  const send = useNet((s) => s.send)
  const leave = useNet((s) => s.leave)
  const heroesWon = phase === 'heroes-won'
  return (
    <Screen label="Fin de la partida">
      <h2 className={heroesWon ? 'result is-win' : 'result is-loss'}>{heroesWon ? '¡Victoria de los héroes!' : '¡Gana el máster!'}</h2>
      <button type="button" className="ui-button ui-button-primary big" onClick={() => send({ type: 'lobby' })}>
        Volver a la sala
      </button>
      <button type="button" className="ui-button small ghost" onClick={leave}>
        Salir
      </button>
    </Screen>
  )
}
