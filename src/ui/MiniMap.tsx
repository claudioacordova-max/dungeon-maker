// The master's map as touch-friendly buttons: every room and every free slot where a room can be built.
// Tap "+" to build there; tap a room to build it, or to watch it when heroes are inside. North is up, like the 3D view.
import { openRoom, useMaster } from '../game/master'
import { useNet } from '../net/connection'
import { buildableSlots, roomAtPoint } from '../shared/map'
import type { Snapshot } from '../shared/protocol'
import { MAX_ROOMS } from '../shared/rules'
import { PLAYER_COLORS } from './screens'

const MAX_CELL = 46 // design px
const MAX_WIDTH = 330
const MAX_HEIGHT = 250

export default function MiniMap({ s }: { s: Snapshot }) {
  const players = useNet((st) => st.players)
  const send = useNet((st) => st.send)
  const setPending = useMaster((m) => m.setPending)
  const bossPlaced = s.rooms.some((r) => r.kind === 'boss')
  const slots = bossPlaced ? [] : buildableSlots(s.rooms)
  const bossNext = s.normalRooms >= MAX_ROOMS
  const cells = [...s.rooms, ...slots]
  const minX = Math.min(...cells.map((c) => c.gx))
  const maxX = Math.max(...cells.map((c) => c.gx))
  const minY = Math.min(...cells.map((c) => c.gy))
  const maxY = Math.max(...cells.map((c) => c.gy))
  const cols = maxX - minX + 1
  const rows = maxY - minY + 1
  const cell = Math.min(MAX_CELL, MAX_WIDTH / cols, MAX_HEIGHT / (rows * 1.18))
  const px = (v: number) => `calc(${v} * var(--ui-px))`

  // Heroes per room, as coloured dots.
  const heroesIn = new Map<number, string[]>()
  for (const h of s.heroes) {
    if (h.dead) continue
    const room = roomAtPoint(s.rooms, h.x, h.y)
    if (!room) continue
    const color = PLAYER_COLORS[players.find((p) => p.id === h.id)?.color ?? 0]
    heroesIn.set(room.id, [...(heroesIn.get(room.id) ?? []), color])
  }

  return (
    <div
      className="minimap"
      role="group"
      aria-label="Mapa de la mazmorra"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${px(cell)})`,
        gridTemplateRows: `repeat(${rows}, ${px(cell * 1.18)})`,
      }}
    >
      {s.rooms.map((r) => {
        const state = r.kind === 'start' ? 'Inicio' : r.kind === 'boss' ? 'Jefe' : r.ready ? 'Lista' : 'En obra'
        const cls = ['mini-room', `is-${r.kind}`, r.ready ? 'is-ready' : 'is-draft', r.entered ? 'is-entered' : ''].join(' ')
        return (
          <button
            key={r.id}
            type="button"
            className={cls}
            style={{ gridColumn: r.gx - minX + 1, gridRow: maxY - r.gy + 1 }}
            aria-label={`Sala ${state}${r.enemies ? `, ${r.enemies} enemigos` : ''}`}
            onClick={() => openRoom(s, r)}
          >
            <span className="mini-label">{r.kind === 'boss' ? '👑' : r.kind === 'start' ? '⌂' : r.ready ? '✓' : '⚒'}</span>
            {r.enemies > 0 && <span className="mini-enemies">{r.enemies}</span>}
            <span className="mini-heroes">
              {(heroesIn.get(r.id) ?? []).map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </span>
          </button>
        )
      })}
      {slots.map((sl) => {
        return (
          <button
            key={`${sl.gx},${sl.gy}`}
            type="button"
            className={['mini-slot', bossNext ? 'is-boss' : ''].join(' ')}
            style={{ gridColumn: sl.gx - minX + 1, gridRow: maxY - sl.gy + 1 }}
            aria-label={bossNext ? 'Construir aquí la sala del jefe' : 'Construir aquí una sala'}
            onClick={() => {
              // Builds at once; the room opens for building when the server confirms it.
              send({ type: 'build', gx: sl.gx, gy: sl.gy, kind: bossNext ? 'boss' : 'normal' })
              setPending(sl)
            }}
          >
            +
          </button>
        )
      })}
    </div>
  )
}
