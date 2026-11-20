// On-screen controls over the game, mobile action style: a floating movement stick that appears where the left
// thumb touches (lower-left area), and an attack stick bottom-right: tap = attack with auto-aim, drag = aim by
// hand, hold = charge the powered attack, released when the thumb lifts.
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { local } from '../game/hero'
import { setAttackStick, setMoveStick } from '../game/input'

const MOVE_RADIUS = 52 // design px the knob can travel
const AIM_DEAD = 16 // design px of drag before it counts as manual aim

function designPx(el: HTMLElement) {
  // The UI is sized in design px through --ui-px; read the real scale from an element of known design width.
  return el.getBoundingClientRect().width / Number(el.dataset.width)
}

export function MoveStick() {
  const zone = useRef<HTMLDivElement>(null)
  const [stick, setStick] = useState<{ x: number; y: number; kx: number; ky: number } | null>(null)
  const pointer = useRef<number | null>(null)
  const origin = useRef({ x: 0, y: 0, scale: 1 })

  function update(e: PointerEvent) {
    const o = origin.current
    let dx = (e.clientX - o.x) / o.scale
    let dy = (e.clientY - o.y) / o.scale
    const len = Math.hypot(dx, dy)
    if (len > MOVE_RADIUS) {
      dx = (dx / len) * MOVE_RADIUS
      dy = (dy / len) * MOVE_RADIUS
    }
    setStick((s) => (s ? { ...s, kx: dx, ky: dy } : s))
    const dead = len < 6
    setMoveStick(dead ? 0 : dx / MOVE_RADIUS, dead ? 0 : -dy / MOVE_RADIUS)
  }

  function release() {
    pointer.current = null
    setStick(null)
    setMoveStick(0, 0)
  }

  return (
    <div
      ref={zone}
      className="move-zone"
      data-width="200"
      aria-label="Mover"
      role="application"
      onPointerDown={(e) => {
        if (pointer.current !== null) return
        pointer.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        const rect = e.currentTarget.getBoundingClientRect()
        const scale = designPx(e.currentTarget)
        origin.current = { x: e.clientX, y: e.clientY, scale }
        setStick({ x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale, kx: 0, ky: 0 })
      }}
      onPointerMove={(e) => pointer.current === e.pointerId && update(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      {stick ? (
        <div className="stick" style={{ left: `calc(${stick.x} * var(--ui-px))`, top: `calc(${stick.y} * var(--ui-px))` }}>
          <div className="stick-knob" style={{ transform: `translate(calc(${stick.kx} * var(--ui-px)), calc(${stick.ky} * var(--ui-px)))` }} />
        </div>
      ) : (
        <div className="stick stick-rest">
          <div className="stick-knob" />
        </div>
      )}
    </div>
  )
}

export function AttackStick({ melee }: { melee: boolean }) {
  const base = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const pointer = useRef<number | null>(null)

  // Charge ring, updated every frame without React renders.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (ring.current) {
        ring.current.style.setProperty('--charge', String(local.charge))
        ring.current.classList.toggle('is-full', local.charge >= 1)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  function update(e: PointerEvent) {
    const el = base.current!
    const rect = el.getBoundingClientRect()
    const scale = designPx(el)
    const dx = (e.clientX - (rect.left + rect.width / 2)) / scale
    const dy = (e.clientY - (rect.top + rect.height / 2)) / scale
    const len = Math.hypot(dx, dy)
    const aiming = len > AIM_DEAD
    const k = Math.min(1, 44 / Math.max(len, 1))
    if (knob.current) knob.current.style.transform = `translate(calc(${dx * k} * var(--ui-px)), calc(${dy * k} * var(--ui-px)))`
    setAttackStick(true, aiming, Math.atan2(-dy, dx))
  }

  function release() {
    pointer.current = null
    if (knob.current) knob.current.style.transform = ''
    setAttackStick(false, local.aim !== null, local.aim ?? 0)
  }

  return (
    <div
      ref={base}
      className={melee ? 'attack-stick is-melee' : 'attack-stick is-ranged'}
      data-width="118"
      role="button"
      aria-label="Atacar (mantener para cargar)"
      onPointerDown={(e) => {
        pointer.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        update(e)
      }}
      onPointerMove={(e) => pointer.current === e.pointerId && update(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div ref={ring} className="charge-ring" />
      <div ref={knob} className="attack-knob">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {melee ? (
            <path d="M19 3 9 13l2 2L21 5V3zM5 15l4 4M3 21l3-3M8 12l4 4" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          ) : (
            <path d="M4 20 20 4M14 4h6v6M4 14l6 6" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          )}
        </svg>
      </div>
    </div>
  )
}
