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

function socketUrl(code: string, intent: 'create' | 'join', name: string): string {
  const local = import.meta.env.DEV
  const host = local ? DEPLOYED_HOST : location.host
  const scheme = local || location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${host}/api/room/${code}?intent=${intent}&name=${encodeURIComponent(name)}`
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
  closed: 'Se perdió la conexión con la sala.',
}

type Status = 'home' | 'connecting' | 'room'

type NetState = {
  status: Status
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

const initialRoom = { you: '', code: '', host: '', phase: 'lobby' as Phase, players: [], notice: '', snapshot: null, latency: 0 }
let pingTimer: ReturnType<typeof setInterval> | null = null

export const useNet = create<NetState>()((set, get) => {
  function connect(code: string, intent: 'create' | 'join', attempt = 0) {
    socket?.close()
    const name = get().name.trim() || 'Jugador'
    set({ status: 'connecting', error: '', ...initialRoom })
    const ws = new WebSocket(socketUrl(code, intent, name))
    socket = ws
    let failed = false

    ws.onmessage = (event) => later(() => {
      if (socket !== ws) return
      const message = JSON.parse(String(event.data)) as ServerMessage
      switch (message.type) {
        case 'welcome':
          set({ status: 'room', you: message.you, code: message.code })
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
          if (message.code === 'taken' && intent === 'create' && attempt < 3) {
            connect(randomCode(), 'create', attempt + 1)
          } else {
            set({ status: 'home', error: ERRORS[message.code] ?? ERRORS['bad-request'] })
          }
          break
      }
    })
    ws.onclose = () => {
      if (socket !== ws || failed) return
      socket = null
      stopPing()
      stopMusic()
      set({ status: 'home', error: ERRORS.closed, ...initialRoom })
    }
  }

  return {
    status: 'home',
    error: '',
    name: localStorageGet('dm-name'),
    ...initialRoom,
    setName: (name) => {
      set({ name })
      localStorageSet('dm-name', name)
    },
    createRoom: () => connect(randomCode(), 'create'),
    joinRoom: (code) => connect(code.trim().toUpperCase(), 'join'),
    leave: () => {
      const ws = socket
      socket = null
      ws?.close()
      stopPing()
      stopMusic()
      clearSnapshots()
      resetHero()
      set({ status: 'home', error: '', ...initialRoom })
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
