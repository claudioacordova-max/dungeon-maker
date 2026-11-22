import { useEffect, useState, type ReactNode } from 'react'
import { me, useNet } from '../net/connection'
import type { HeroClass, PassiveId } from '../shared/protocol'
import { MAX_HEROES } from '../shared/rules'
import { EnterIcon, ScanIcon, ShareIcon, UserIcon } from './icons'

// Menu art generated for the game (public/ui/), styled after the designer's references.
export const art = (file: string) => `/ui/${file}`

export const PLAYER_COLORS = ['#38bdf8', '#f472b6', '#facc15', '#a3e635', '#fb923c']

export const CLASS_NAME: Record<HeroClass, string> = { melee: 'Espadachín', ranged: 'Arquera', priest: 'Sacerdotisa', mage: 'Mago' }
export const CLASS_TAG: Record<HeroClass, string> = { melee: 'Cuerpo a cuerpo', ranged: 'A distancia', priest: 'Cura al equipo', mage: 'Hechizos' }
// Portraits taken from the 3D models (src/ui/PhotoStudio.tsx, ?photos). The older painted cards (card-*.webp) stay
// in public/ui/ for comparison.
export const PHOTO: Record<HeroClass | 'master' | 'party', string> = {
  melee: 'photo-melee.webp',
  ranged: 'photo-ranged.webp',
  priest: 'photo-priest.webp',
  mage: 'photo-mage.webp',
  master: 'photo-master.webp',
  party: 'photo-party.webp',
}
export const PASSIVE_INFO: Record<PassiveId, { name: string; text: string }> = {
  recover: { name: 'Recuperar fuerzas', text: 'Al limpiar una sala de enemigos, recupera 1 golpe.' },
  tough: { name: 'Piel dura', text: 'A veces (10 %) ignora un golpe.' },
  keenEye: { name: 'Ojo certero', text: 'Sus flechas básicas pueden ser críticas (3 %, doble daño).' },
  focus: { name: 'Mente clara', text: 'Cada enemigo que derrota le devuelve 1 de maná.' },
}

// Dungeon backdrop for the menus (home, lobby, connecting).
function MenuScreen({ label, children, kind = '' }: { label: string; children: ReactNode; kind?: string }) {
  return (
    <section className={`screen menu-screen ${kind}`} aria-label={label}>
      <div className="menu-content">{children}</div>
    </section>
  )
}

// Stone panel with the crown pennant on top, the ribbon below and torches on the sides.
function StonePanel({ children, torches = true }: { children: ReactNode; torches?: boolean }) {
  return (
    <div className="stone-panel">
      <img className="stone-crown" src={art('crown-tab.webp')} alt="" />
      {torches && (
        <>
          <img className="stone-torch is-left" src={art('torch.webp')} alt="" />
          <img className="stone-torch is-right" src={art('torch.webp')} alt="" />
        </>
      )}
      <div className="stone-inner">{children}</div>
      <img className="stone-ribbon" src={art('ribbon.webp')} alt="" />
    </div>
  )
}

function Tagline({ children }: { children: ReactNode }) {
  return (
    <p className="tagline">
      <span aria-hidden="true">✦</span>
      {children}
      <span aria-hidden="true">✦</span>
    </p>
  )
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <h1 className={small ? 'logo-art is-small' : 'logo-art'}>
      <img src={art('logo.webp')} alt="Dungeon Maker" />
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
    <MenuScreen label="Inicio">
      <Logo />
      <Tagline>Construye la mazmorra. Sobrevive la carrera.</Tagline>
      <div className="home-scene" role="img" aria-label="Un espadachín frente a dos slimes en la mazmorra" />
      <StonePanel>
        <label className="field">
          <span className="field-label">
            <UserIcon /> Tu nombre
          </span>
          <input className="field-input" value={name} maxLength={16} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="button" className="ui-button ui-button-primary big" disabled={!hasName} onClick={createRoom}>
          Crear sala
        </button>
        <div className="join-row">
          <label className="code-field">
            <ScanIcon />
            <input
              className="code-input"
              value={code}
              maxLength={4}
              placeholder="CÓDIGO"
              autoComplete="off"
              autoCapitalize="characters"
              aria-label="Código de sala"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            />
          </label>
          <button type="button" className="ui-button ui-button-blue with-icon" disabled={!hasName || !validCode} onClick={() => joinRoom(code)}>
            <EnterIcon />
            Entrar
          </button>
        </div>
        {error && <p className="screen-error">{error}</p>}
      </StonePanel>
    </MenuScreen>
  )
}

// Fetches the 3D game in the background (from the lobby), so starting a match does not wait for it.
export const preloadGame = () => void import('../scene/GameView')

// Centred logo, a label and a progress bar that eases towards the end while something loads.
export function LoadingScreen({ label }: { label: string }) {
  return (
    <section className="screen menu-screen loading-screen" aria-label={label} aria-busy="true">
      <div className="loading-box">
        <Logo />
        <p className="loading-label">{label}</p>
        <div className="loading-bar" role="progressbar" aria-label={label}>
          <i />
        </div>
      </div>
    </section>
  )
}

export function ConnectingScreen() {
  useEffect(preloadGame, [])
  return <LoadingScreen label="Abriendo la mazmorra…" />
}

type RolePick = 'master' | 'hero'

export function LobbyScreen() {
  const state = useNet()
  const self = me(state)
  const [copied, setCopied] = useState(false)
  const isHost = state.you === state.host
  const master = state.players.find((p) => p.role === 'master')
  const heroes = state.players.filter((p) => p.role === 'hero')
  const canStart = isHost && !!master && heroes.length >= 1 && heroes.length <= MAX_HEROES
  useEffect(preloadGame, [])
  // In the lobby each player only chooses Maestro or hero; the heroes pick who they are at the dungeon entrance.
  const confirmed: RolePick | undefined = self?.role
  // The card lights up at once (optimistic); if the server says otherwise (e.g. someone else took the master),
  // the confirmed choice comes back within a moment.
  const [optimistic, setOptimistic] = useState<{ id: RolePick; at: number } | null>(null)
  useEffect(() => {
    if (!optimistic) return
    if (optimistic.id === confirmed) {
      setOptimistic(null)
      return
    }
    const t = setTimeout(() => setOptimistic(null), 1500)
    return () => clearTimeout(t)
  }, [optimistic, confirmed])
  const selected = optimistic?.id ?? confirmed

  function choose(id: RolePick) {
    setOptimistic({ id, at: performance.now() })
    state.send({ type: 'role', role: id })
  }

  async function invite() {
    const text = `¡Únete a mi mazmorra en Dungeon Maker! Código: ${state.code}`
    try {
      if (navigator.share) await navigator.share({ title: 'Dungeon Maker', text, url: location.origin })
      else {
        await navigator.clipboard.writeText(`${text} ${location.origin}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      // share sheet closed
    }
  }

  return (
    <MenuScreen label="Sala" kind="lobby-screen">
      <Logo small />
      <Tagline>1 jugador construye. Los demás sobreviven.</Tagline>
      <StonePanel>
        <div className="code-head">
          <span className="code-title">Código de la sala</span>
          <span className="code-plaque">{state.code}</span>
        </div>
        {state.notice && <p className="screen-error">{state.notice}</p>}
        <ul className="lobby-list">
          {state.players.map((p) => (
            <li key={p.id} className={p.id === state.you ? 'lobby-player is-you' : 'lobby-player'}>
              <span className="player-dot" style={{ background: PLAYER_COLORS[p.color] }} />
              <span className="lobby-name">{p.name}</span>
              {p.away && <span className="away-tag">Reconectando…</span>}
              {p.id === state.host && <span className="host-tag">Anfitrión</span>}
              <span className="lobby-role">
                {p.role === 'master' ? 'Maestro' : 'Héroe'}
              </span>
            </li>
          ))}
        </ul>
        <div className="role-cards" role="group" aria-label="Elige tu papel">
          <button
            type="button"
            className={['role-card', 'is-master', selected === 'master' ? 'is-selected' : ''].join(' ')}
            aria-pressed={selected === 'master'}
            disabled={!!master && master.id !== state.you}
            onClick={() => choose('master')}
          >
            <img className="role-photo" src={art(PHOTO.master)} alt="" />
            <b>Maestro</b>
            <small>{master && master.id !== state.you ? `Lo es ${master.name}` : 'Construye la mazmorra'}</small>
          </button>
          <button
            type="button"
            className={['role-card', 'is-hero', selected === 'hero' ? 'is-selected' : ''].join(' ')}
            aria-pressed={selected === 'hero'}
            disabled={heroes.length >= MAX_HEROES && self?.role !== 'hero'}
            onClick={() => choose('hero')}
          >
            <img className="role-photo" src={art(PHOTO.party)} alt="" />
            <b>Héroes</b>
            <small>
              {heroes.length}/{MAX_HEROES} · Eligen su héroe al llegar
            </small>
          </button>
        </div>
        <div className="lobby-actions">
          <button type="button" className="ui-button ui-button-blue with-icon" onClick={invite}>
            <ShareIcon />
            {copied ? '¡Copiado!' : 'Invitar'}
          </button>
          {isHost ? (
            <button type="button" className="ui-button ui-button-primary" disabled={!canStart} onClick={() => state.send({ type: 'start' })}>
              Empezar
            </button>
          ) : (
            <span className="screen-hint">El anfitrión empieza.</span>
          )}
        </div>
        {isHost && !canStart && <Tagline>Hace falta un maestro y al menos un héroe.</Tagline>}
        <button type="button" className="ui-button ui-button-light" onClick={state.leave}>
          Salir
        </button>
      </StonePanel>
    </MenuScreen>
  )
}

export function EndScreen() {
  const phase = useNet((s) => s.phase)
  const send = useNet((s) => s.send)
  const leave = useNet((s) => s.leave)
  const heroesWon = phase === 'heroes-won'
  return (
    <section className="screen end-screen" aria-label="Fin de la partida">
      <StonePanel torches={false}>
        <img className="end-art" src={art(heroesWon ? 'end-victory.webp' : 'end-defeat.webp')} alt="" />
        <h2 className={heroesWon ? 'result is-win' : 'result is-loss'}>{heroesWon ? '¡Victoria de los héroes!' : '¡Gana el maestro de la mazmorra!'}</h2>
        <button type="button" className="ui-button ui-button-primary big" onClick={() => send({ type: 'lobby' })}>
          Volver a la sala
        </button>
        <button type="button" className="ui-button ui-button-light" onClick={leave}>
          Salir
        </button>
      </StonePanel>
    </section>
  )
}
