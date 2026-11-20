import { useRef, useState, type PointerEvent } from 'react'
import { setJoystick } from '../game/input'

// Thumb joystick, anchored bottom-left. Works with touch and mouse (Pointer Events).
const RADIUS = 48 // design px: how far the knob travels
const BASE = 130 // design px: joystick width, matches .joystick in game.css

export default function Joystick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const pointer = useRef<number | null>(null)

  function update(e: PointerEvent) {
    const rect = base.current!.getBoundingClientRect()
    const scale = rect.width / BASE // screen px per design px
    let x = (e.clientX - (rect.left + rect.width / 2)) / scale
    let y = (e.clientY - (rect.top + rect.height / 2)) / scale
    const len = Math.hypot(x, y)
    if (len > RADIUS) {
      x = (x / len) * RADIUS
      y = (y / len) * RADIUS
    }
    setKnob({ x, y })
    const dead = len < 6
    setJoystick(dead ? 0 : x / RADIUS, dead ? 0 : -y / RADIUS)
  }

  function release() {
    pointer.current = null
    setKnob({ x: 0, y: 0 })
    setJoystick(0, 0)
  }

  return (
    <div
      ref={base}
      className="joystick"
      role="application"
      aria-label="Mover"
      onPointerDown={(e) => {
        pointer.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        update(e)
      }}
      onPointerMove={(e) => pointer.current === e.pointerId && update(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div
        className="joystick-knob"
        style={{ transform: `translate(calc(${knob.x} * var(--ui-px)), calc(${knob.y} * var(--ui-px)))` }}
      />
    </div>
  )
}
