// Hero input: on-screen joystick and attack button (touch or mouse), or WASD/arrows + Space on a keyboard.
// Movement is sent as soon as it changes (at most every 40 ms) and also used locally to predict the own hero.
import { useNet } from '../net/connection'

const joystick = { x: 0, y: 0 }
const keys = new Set<string>()
let lastSent = { x: 0, y: 0 }
let lastSentAt = 0
let pending = false

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

// Current movement direction, length 0..1.
export function moveInput(): { x: number; y: number } {
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

function flush() {
  const net = useNet.getState()
  if (net.phase !== 'playing') return
  const now = performance.now()
  if (now - lastSentAt < 40) {
    if (!pending) {
      pending = true
      setTimeout(() => {
        pending = false
        flush()
      }, 40)
    }
    return
  }
  const v = moveInput()
  net.send({ type: 'input', dx: Math.round(v.x * 100) / 100, dy: Math.round(v.y * 100) / 100 })
  lastSent = { ...v }
  lastSentAt = now
}

function changed() {
  const v = moveInput()
  if (Math.abs(v.x - lastSent.x) > 0.04 || Math.abs(v.y - lastSent.y) > 0.04) flush()
}

export function setJoystick(x: number, y: number) {
  joystick.x = x
  joystick.y = y
  changed()
}

export function attack() {
  useNet.getState().send({ type: 'attack' })
}

let started = false

export function startInput() {
  if (started) return
  started = true
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return
    if (KEY_DIRS[e.code]) {
      keys.add(e.code)
      changed()
    } else if (e.code === 'Space' && !e.repeat) {
      e.preventDefault()
      attack()
    }
  })
  addEventListener('keyup', (e) => {
    if (keys.delete(e.code)) changed()
  })
  addEventListener('blur', () => {
    keys.clear()
    changed()
  })
  // Keep-alive resend, in case a message was dropped.
  setInterval(() => {
    if (performance.now() - lastSentAt > 1000) flush()
  }, 250)
}
