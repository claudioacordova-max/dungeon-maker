// One Durable Object per room code: keeps the lobby and runs the authoritative game loop in memory.
import type { ClientMessage, LobbyPlayer, Phase, Role, ServerMessage } from '../src/shared/protocol.ts'
import { MAX_HEROES, TICK_HZ } from '../src/shared/rules.ts'
import { createGame, place, remove, removeHero, setInput, snapshot, step, type Game } from '../src/shared/sim.ts'

type Player = LobbyPlayer & { socket: WebSocket }

const MAX_NAME = 16

export class Room {
  private created = false
  private code = ''
  private players: Player[] = []
  private host = ''
  private phase: Phase = 'lobby'
  private game: Game | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private lastTick = 0

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const intent = url.searchParams.get('intent')
    const name = (url.searchParams.get('name') ?? '').trim().slice(0, MAX_NAME) || 'Jugador'
    const code = url.pathname.split('/').pop() ?? ''

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    server.accept()

    const refuse = (error: Extract<ServerMessage, { type: 'error' }>['code']) => {
      server.send(JSON.stringify({ type: 'error', code: error } satisfies ServerMessage))
      server.close(1000, error)
      return new Response(null, { status: 101, webSocket: client })
    }

    if (this.players.length === 0) this.reset()
    if (intent === 'create') {
      if (this.created) return refuse('taken')
      this.created = true
      this.code = code
    } else if (intent === 'join') {
      if (!this.created) return refuse('no-room')
      if (this.phase !== 'lobby') return refuse('started')
      if (this.players.length >= MAX_HEROES + 1) return refuse('full')
    } else {
      return refuse('bad-request')
    }

    const id = crypto.randomUUID().slice(0, 8)
    const used = new Set(this.players.map((p) => p.color))
    const color = [0, 1, 2, 3, 4].find((c) => !used.has(c)) ?? 0
    const player: Player = { id, name, role: 'hero', color, socket: server }
    this.players.push(player)
    if (!this.host) this.host = id

    server.addEventListener('message', (event) => this.onMessage(player, event.data))
    server.addEventListener('close', () => this.onLeave(player))
    server.addEventListener('error', () => this.onLeave(player))

    this.send(player, { type: 'welcome', you: id, code: this.code })
    this.broadcastLobby()
    return new Response(null, { status: 101, webSocket: client })
  }

  private reset() {
    this.stopLoop()
    this.created = false
    this.code = ''
    this.players = []
    this.host = ''
    this.phase = 'lobby'
    this.game = null
  }

  private send(player: Player, message: ServerMessage) {
    try {
      player.socket.send(JSON.stringify(message))
    } catch {
      // The close handler removes the player.
    }
  }

  private broadcastLobby(reason?: string) {
    const players = this.players.map(({ id, name, role, color }) => ({ id, name, role, color }))
    for (const p of this.players) this.send(p, { type: 'lobby', host: this.host, phase: this.phase, players, reason })
  }

  private onMessage(player: Player, data: unknown) {
    let message: ClientMessage
    try {
      message = JSON.parse(String(data)) as ClientMessage
    } catch {
      return
    }
    switch (message.type) {
      case 'role':
        return this.setRole(player, message.role)
      case 'start':
        return this.start(player)
      case 'input':
        if (this.game && player.role === 'hero') setInput(this.game, player.id, Number(message.dx), Number(message.dy))
        return
      case 'place':
        if (this.game && player.role === 'master') place(this.game, message.kind, Number(message.cx), Number(message.cy))
        return
      case 'remove':
        if (this.game && player.role === 'master') remove(this.game, Number(message.cx), Number(message.cy))
        return
      case 'lobby':
        if (this.phase === 'heroes-won' || this.phase === 'master-won') this.toLobby()
        return
    }
  }

  private setRole(player: Player, role: Role) {
    if (this.phase !== 'lobby') return
    if (role === 'master') {
      if (this.players.some((p) => p.role === 'master' && p !== player)) return
      player.role = 'master'
    } else if (role === 'hero') {
      if (this.players.filter((p) => p.role === 'hero' && p !== player).length >= MAX_HEROES) return
      player.role = 'hero'
    }
    this.broadcastLobby()
  }

  private start(player: Player) {
    if (this.phase !== 'lobby' || player.id !== this.host) return
    const heroes = this.players.filter((p) => p.role === 'hero')
    if (!this.players.some((p) => p.role === 'master') || heroes.length < 1 || heroes.length > MAX_HEROES) return
    this.game = createGame(heroes.map((h) => h.id))
    this.phase = 'playing'
    this.broadcastLobby()
    this.lastTick = Date.now()
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ)
  }

  private tick() {
    const game = this.game
    if (!game) return
    const now = Date.now()
    const dt = Math.min(0.1, (now - this.lastTick) / 1000)
    this.lastTick = now
    step(game, dt)
    const forHeroes = JSON.stringify({ type: 'state', s: snapshot(game, false) } satisfies ServerMessage)
    const forMaster = JSON.stringify({ type: 'state', s: snapshot(game, true) } satisfies ServerMessage)
    for (const p of this.players) {
      try {
        p.socket.send(p.role === 'master' ? forMaster : forHeroes)
      } catch {
        // ignored; close handler cleans up
      }
    }
    if (game.result !== 'playing') {
      this.phase = game.result
      this.stopLoop()
      this.broadcastLobby()
    }
  }

  private stopLoop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private toLobby() {
    this.stopLoop()
    this.game = null
    this.phase = 'lobby'
    this.broadcastLobby()
  }

  private onLeave(player: Player) {
    if (!this.players.includes(player)) return
    this.players = this.players.filter((p) => p !== player)
    if (this.players.length === 0) return this.reset()
    if (this.host === player.id) this.host = this.players[0].id
    if (this.phase === 'playing' && this.game) {
      if (player.role === 'master') {
        this.stopLoop()
        this.game = null
        this.phase = 'lobby'
        return this.broadcastLobby('El máster salió de la partida.')
      }
      removeHero(this.game, player.id)
      if (this.game.heroes.length === 0) {
        this.toLobby()
        return
      }
    }
    this.broadcastLobby()
  }
}
