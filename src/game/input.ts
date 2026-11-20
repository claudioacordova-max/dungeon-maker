// Hero movement input: on-screen joystick (touch or mouse) or WASD/arrows. Sent to the room server ~10 times a second.
import { useNet } from '../net/connection'

const joystick = { x: 0, y: 0 }
const keys = new Set<string>()
let lastSent = { x: 0, y: 0 }
let lastSentAt = 0

export function setJoystick(x: number, y: number) {
  joystick.x = x
  joystick.y = y
}

const KEY_DIRS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

function current(): { x: number; y: number } {
  if (joystick.x !== 0 || joystick.y !== 0) return joystick
  let x = 0
  let y = 0
  for (const code of keys) {
    const dir = KEY_DIRS[code]
    if (dir) {
      x += dir[0]
      y += dir[1]
    }
  }
  const len = Math.hypot(x, y)
  return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 }
}

let started = false

export function startInput() {
  if (started) return
  started = true
  addEventListener('keydown', (e) => {
    if (KEY_DIRS[e.code] && !(e.target instanceof HTMLInputElement)) keys.add(e.code)
  })
  addEventListener('keyup', (e) => keys.delete(e.code))
  addEventListener('blur', () => keys.clear())
  setInterval(() => {
    const net = useNet.getState()
    if (net.phase !== 'playing') return
    const v = current()
    const now = performance.now()
    const changed = Math.abs(v.x - lastSent.x) > 0.05 || Math.abs(v.y - lastSent.y) > 0.05
    if (!changed && now - lastSentAt < 1000) return
    net.send({ type: 'input', dx: Math.round(v.x * 100) / 100, dy: Math.round(v.y * 100) / 100 })
    lastSent = { ...v }
    lastSentAt = now
  }, 100)
}
