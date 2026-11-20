import { create } from 'zustand'
import { playSnapshotSounds } from '../audio/events'
import { sfx, startMusic, stopMusic } from '../audio/sfx'
import { onSnapshot, resetHero } from '../game/hero'
import { clearSnapshots, pushSnapshot } from './interp'
import { CODE_LETTERS, type ClientMessage, type LobbyPlayer, type Phase, type ServerMessage, type Snapshot } from '../shared/protocol'

// Development aids from the URL: ?lag=300 adds that many ms of round trip (half each way) to test the worst case
// without a slow network; ?ghost draws where the server has each hero and enemy.
const params = new URLSearchParams(location.search)
export const SIM_LAG = Math.max(0, Math.min(2000, Number(params.get('lag')) || 0))
export const SHOW_GHOSTS = params.has('ghost')

function later(fn: () => void) {
  if (SIM_LAG > 0) setTimeout(fn, SIM_LAG / 2)
  else fn()
}

// The deployed Worker hosts the room server. In `npm run dev` there is no local server, so the dev build talks to it too.
const DEPLOYED_HOST = 'dungeon-maker.claudioa-cordova.workers.dev'

type Intent = 'create' | 'join' | 'rejoin'

function socketUrl(code: string, intent: Intent, name: string, extra = ''): string {
  const local = import.meta.env.DEV
  const host = local ? DEPLOYED_HOST : location.host
  const scheme = local || location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${host}/api/room/${code}?intent=${intent}&name=${encodeURIComponent(name)}${extra}`
}

export function randomCode(): string {
  let code = ''
  for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]
  return code
}

const ERRORS: Record<string, string> = {
  'no-room': 'No existe una sala con ese código.',
  taken: 'Ese código ya está en uso. Prueba otra vez.',
  full: 'La sala está llena.',
  started: 'La partida ya empezó en esa sala.',
  'bad-request': 'No se pudo conectar.',
  gone: 'La sala ya no te esperaba: estuviste desconectado demasiado tiempo.',
  closed: 'Se perdió la conexión con la sala.',
}

type Status = 'home' | 'connecting' | 'room'

type NetState = {
  status: Status
  reconnecting: boolean
  error: string
  name: string
  you: string
  code: string
  host: string
  phase: Phase
  players: LobbyPlayer[]
  notice: string
  snapshot: Snapshot | null
  latency: number // ms round trip to the room server, 0 = unknown
  setName: (name: string) => void
  createRoom: () => void
  joinRoom: (code: string) => void
  leave: () => void
  send: (message: ClientMessage) => void
}

let socket: WebSocket | null = null
// Who we are in the current room, to come back as the same player after a dropped connection.
let session: { code: string; id: string; token: string } | null = null
let lastMessageAt = 0
let rejoinAttempts = 0
let rejoinTimer: ReturnType<typeof setTimeout> | null = null

const initialRoom = { you: '', code: '', host: '', phase: 'lobby' as Phase, players: [], notice: '', snapshot: null, latency: 0 }
let pingTimer: ReturnType<typeof setInterval> | null = null

const STALE_MS = 7000 // no message for this long while in a room: the connection is dead (pings go every 2 s)
const MAX_REJOINS = 5

export const useNet = create<NetState>()((set, get) => {
  function goHome(error: string) {
    socket = null
    session = null
    stopPing()
    stopMusic()
    clearSnapshots()
    resetHero()
    if (rejoinTimer) clearTimeout(rejoinTimer)
    set({ status: 'home', reconnecting: false, error, ...initialRoom })
  }

  function open(code: string, intent: Intent, attempt = 0) {
    const old = socket
    socket = null
    old?.close()
    const name = get().name.trim() || 'Jugador'
    if (intent !== 'rejoin') set({ status: 'connecting', error: '', ...initialRoom })
    const extra = intent === 'rejoin' && session ? `&id=${session.id}&token=${session.token}` : ''
    const ws = new WebSocket(socketUrl(code, intent, name, extra))
    socket = ws
    lastMessageAt = performance.now()
    let failed = false

    ws.onmessage = (event) =>
      later(() => {
        if (socket !== ws) return
        lastMessageAt = performance.now()
        const message = JSON.parse(String(event.data)) as ServerMessage
        switch (message.type) {
          case 'welcome':
            session = { code: message.code, id: message.you, token: message.token }
            rejoinAttempts = 0
            set({ status: 'room', reconnecting: false, you: message.you, code: message.code })
            startMusic()
            if (pingTimer) clearInterval(pingTimer)
            pingTimer = setInterval(() => get().send({ type: 'ping', t: performance.now() }), 2000)
            get().send({ type: 'ping', t: performance.now() })
            break
          case 'pong':
            set({ latency: Math.round(performance.now() - message.t) })
            break
          case 'lobby': {
            const before = get().phase
            const self = message.players.find((p) => p.id === get().you)
            if (message.phase !== before && (message.phase === 'heroes-won' || message.phase === 'master-won')) {
              const won = (message.phase === 'heroes-won') === (self?.role === 'hero')
              if (won) sfx.victory()
              else sfx.defeat()
            }
            set((s) => ({
              host: message.host,
              phase: message.phase,
              players: message.players,
              notice: message.reason ?? (message.phase === 'lobby' ? '' : s.notice),
              snapshot: message.phase === 'lobby' ? null : s.snapshot,
            }))
            if (message.phase === 'lobby') {
              clearSnapshots()
              resetHero()
            }
            break
          }
          case 'state': {
            const prev = get().snapshot
            const role = get().players.find((p) => p.id === get().you)?.role
            pushSnapshot(message.s)
            onSnapshot(message.s, get().you)
            playSnapshotSounds(prev, message.s, get().you, role === 'hero')
            set({ snapshot: message.s })
            break
          }
          case 'error':
            failed = true
            if (message.code === 'taken' && intent === 'create' && attempt < 3) open(randomCode(), 'create', attempt + 1)
            else goHome(ERRORS[message.code] ?? ERRORS['bad-request'])
            break
        }
      })
    ws.onclose = () => {
      if (socket !== ws || failed) return
      // In a room: try to come back as the same player; otherwise back to the home screen.
      if (session) rejoin()
      else goHome(ERRORS.closed)
    }
  }

  // Reconnects to the same room as the same player (role, class and hero kept by the server for a few seconds).
  function rejoin() {
    if (!session || rejoinTimer) return
    if (rejoinAttempts >= MAX_REJOINS) return goHome(ERRORS.closed)
    set({ reconnecting: true })
    const delay = rejoinAttempts === 0 ? 0 : Math.min(3000, 500 * 2 ** (rejoinAttempts - 1))
    rejoinAttempts += 1
    rejoinTimer = setTimeout(() => {
      rejoinTimer = null
      if (session) open(session.code, 'rejoin')
    }, delay)
  }

  // A phone may freeze the page (e.g. while sharing the code in another app) and kill the connection silently.
  function checkAlive() {
    if (!session || get().status !== 'room') return
    const dead = !socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING
    if (dead || performance.now() - lastMessageAt > STALE_MS) rejoin()
  }
  setInterval(checkAlive, 1000)
  // Development only: window.__dmDrop() cuts the connection, to test rejoining.
  if (import.meta.env.DEV) (window as unknown as { __dmDrop: () => void }).__dmDrop = () => socket?.close()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastMessageAt = Math.min(lastMessageAt, performance.now() - STALE_MS + 2500) // decide within ~2.5 s
      checkAlive()
    }
  })

  return {
    status: 'home',
    reconnecting: false,
    error: '',
    name: localStorageGet('dm-name'),
    ...initialRoom,
    setName: (name) => {
      set({ name })
      localStorageSet('dm-name', name)
    },
    createRoom: () => open(randomCode(), 'create'),
    joinRoom: (code) => open(code.trim().toUpperCase(), 'join'),
    leave: () => {
      const ws = socket
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'leave' } satisfies ClientMessage))
      ws?.close()
      goHome('')
    },
    send: (message) => {
      const ws = socket
      const data = JSON.stringify(message)
      later(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(data)
      })
    },
  }
})

function stopPing() {
  if (pingTimer) clearInterval(pingTimer)
  pingTimer = null
}

function localStorageGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function localStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode: the name is just not remembered.
  }
}

export function me(state: NetState): LobbyPlayer | undefined {
  return state.players.find((p) => p.id === state.you)
}
