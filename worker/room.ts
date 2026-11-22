// One Durable Object per room code: keeps the lobby and runs the authoritative game loop in memory.
import { HERO_CLASSES, type ClientMessage, type HeroClass, type LobbyPlayer, type Phase, type Role, type ServerMessage } from '../src/shared/protocol.ts'
import { MAX_HEROES, TICK_HZ } from '../src/shared/rules.ts'
import {
  attack,
  build,
  createGame,
  demolish,
  openChest,
  introReady,
  possess,
  release,
  steer,
  enemyAct,
  summon,
  place,
  removeHero,
  removeItem,
  reportOrb,
  reportPosition,
  reportStruck,
  reportTouched,
  setLayout,
  setReady,
  shotHit,
  shotHeal,
  snapshot,
  step,
  type Game,
} from '../src/shared/sim.ts'

type Player = LobbyPlayer & { socket: WebSocket; token: string; awayTimer: ReturnType<typeof setTimeout> | null }

// A player whose connection drops keeps their place this long (phones pause pages, e.g. while sharing the code).
const GRACE_MS = 30000

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

    if (intent === 'rejoin') {
      const id = url.searchParams.get('id')
      const token = url.searchParams.get('token')
      const player = this.players.find((p) => p.id === id && p.token === token)
      if (!this.created || !player) return refuse('gone')
      const old = player.socket
      player.socket = server
      if (player.awayTimer) clearTimeout(player.awayTimer)
      player.awayTimer = null
      player.away = false
      try {
        old.close(1000, 'replaced')
      } catch {
        // already closed
      }
      this.listen(player, server)
      this.send(player, { type: 'welcome', you: player.id, code: this.code, token: player.token })
      this.broadcastLobby()
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
    const token = crypto.randomUUID()
    const player: Player = { id, name, role: 'hero', cls: 'melee', color, socket: server, token, awayTimer: null }
    this.players.push(player)
    if (!this.host) this.host = id

    this.listen(player, server)
    this.send(player, { type: 'welcome', you: id, code: this.code, token })
    this.broadcastLobby()
    return new Response(null, { status: 101, webSocket: client })
  }

  private listen(player: Player, socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      if (player.socket === socket) this.onMessage(player, event.data)
    })
    socket.addEventListener('close', () => this.onDrop(player, socket))
    socket.addEventListener('error', () => this.onDrop(player, socket))
  }

  // Connection lost: keep the player (and their hero) for GRACE_MS so they can rejoin.
  private onDrop(player: Player, socket: WebSocket) {
    if (player.socket !== socket || player.awayTimer || !this.players.includes(player)) return
    player.away = true
    player.awayTimer = setTimeout(() => this.onLeave(player), GRACE_MS)
    this.broadcastLobby()
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
    const players = this.players.map(({ id, name, role, cls, color, away }) => ({ id, name, role, cls, color, away }))
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
      case 'class':
        if (this.phase === 'lobby' && HERO_CLASSES.includes(message.cls as HeroClass)) {
          player.cls = message.cls as HeroClass
          this.broadcastLobby()
        }
        return
      case 'ping':
        return this.send(player, { type: 'pong', t: Number(message.t) })
      case 'leave':
        return this.onLeave(player)
    }
    const game = this.game
    if (!game) return
    if (player.role === 'hero') {
      switch (message.type) {
        case 'pos':
          return reportPosition(game, player.id, Number(message.x), Number(message.y), Number(message.facing), Number(message.epoch))
        case 'attack':
          attack(game, player.id, Number(message.seq), message.kind === 'charged' ? 'charged' : 'basic', Number(message.dir), message.hits, Number(message.viewDelay))
          return
        case 'shotHit':
          shotHit(game, player.id, Number(message.seq), Number(message.target), Number(message.viewDelay))
          return
        case 'shotHeal':
          shotHeal(game, player.id, Number(message.seq), String(message.ally))
          return
        case 'struck':
          reportStruck(game, player.id, Number(message.strike))
          return
        case 'orbHit':
          reportOrb(game, player.id, Number(message.orb))
          return
        case 'touched':
          reportTouched(game, player.id, Number(message.enemy))
          return
        case 'openChest':
          openChest(game, player.id, Number(message.item))
          return
        case 'introReady':
          introReady(game, player.id)
          return
      }
    } else {
      switch (message.type) {
        case 'build':
          build(game, Number(message.gx), Number(message.gy), message.kind === 'boss' ? 'boss' : 'normal')
          return
        case 'demolish':
          demolish(game, Number(message.room))
          return
        case 'place':
          place(game, Number(message.room), message.kind, Number(message.cx), Number(message.cy))
          return
        case 'remove':
          removeItem(game, Number(message.room), Number(message.cx), Number(message.cy))
          return
        case 'layout':
          setLayout(game, Number(message.room), message.shape, message.spikes, message.chests)
          return
        case 'ready':
          setReady(game, Number(message.room), message.ready === true)
          return
        case 'possess':
          possess(game, Number(message.enemy))
          return
        case 'release':
          release(game)
          return
        case 'steer':
          steer(game, Number(message.x), Number(message.y), Number(message.facing))
          return
        case 'enemyAct':
          enemyAct(game, message.kind === 'special' ? 'special' : 'attack', Number(message.dir))
          return
        case 'summon':
          summon(game, Number(message.room))
          return
      }
    }
    switch (message.type) {
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
    this.game = createGame(heroes.map((h) => ({ id: h.id, cls: h.cls })))
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
    if (player.awayTimer) clearTimeout(player.awayTimer)
    player.awayTimer = null
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
