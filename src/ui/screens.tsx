import { useState, type ReactNode } from 'react'
import { me, useNet } from '../net/connection'
import { MAX_HEROES } from '../shared/rules'
import { CrownIcon, SwordIcon } from './icons'

function Screen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="screen" aria-label={label}>
      <div className="screen-panel panel">{children}</div>
    </section>
  )
}

export const PLAYER_COLORS = ['#60a5fa', '#f472b6', '#facc15', '#a78bfa', '#fb923c']

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
      <h1 className="screen-title">{document.title}</h1>
      <label className="field">
        <span className="field-label">Tu nombre</span>
        <input
          className="field-input"
          value={name}
          maxLength={16}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button type="button" className="ui-button ui-button-primary" disabled={!hasName} onClick={createRoom}>
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
    <Screen label="Sala">
      <p className="lobby-code-label">Código de la sala</p>
      <p className="lobby-code">{state.code}</p>
      {state.notice && <p className="screen-error">{state.notice}</p>}
      <ul className="lobby-list">
        {state.players.map((p) => (
          <li key={p.id} className="lobby-player">
            <span className="player-dot" style={{ background: PLAYER_COLORS[p.color] }} />
            <span className="lobby-name">
              {p.name}
              {p.id === state.you && ' (tú)'}
            </span>
            <span className="lobby-role" aria-label={p.role === 'master' ? 'Máster' : 'Héroe'}>
              {p.role === 'master' ? <CrownIcon /> : <SwordIcon />}
            </span>
          </li>
        ))}
      </ul>
      {self?.role === 'hero' ? (
        <button
          type="button"
          className="ui-button"
          disabled={!!master}
          onClick={() => state.send({ type: 'role', role: 'master' })}
        >
          Ser el máster
        </button>
      ) : (
        <button type="button" className="ui-button" onClick={() => state.send({ type: 'role', role: 'hero' })}>
          Ser héroe
        </button>
      )}
      {isHost ? (
        <button
          type="button"
          className="ui-button ui-button-primary"
          disabled={!canStart}
          onClick={() => state.send({ type: 'start' })}
        >
          Empezar
        </button>
      ) : (
        <p className="screen-hint">El anfitrión empieza la partida.</p>
      )}
      {isHost && !canStart && <p className="screen-hint">Hace falta un máster y al menos un héroe.</p>}
      <button type="button" className="ui-button" onClick={state.leave}>
        Salir
      </button>
    </Screen>
  )
}

export function EndScreen() {
  const phase = useNet((s) => s.phase)
  const send = useNet((s) => s.send)
  const leave = useNet((s) => s.leave)
  return (
    <Screen label="Fin de la partida">
      <h2 className="screen-title">{phase === 'heroes-won' ? 'Ganan los héroes' : 'Gana el máster'}</h2>
      <button type="button" className="ui-button ui-button-primary" onClick={() => send({ type: 'lobby' })}>
        Volver a la sala
      </button>
      <button type="button" className="ui-button" onClick={leave}>
        Salir
      </button>
    </Screen>
  )
}
