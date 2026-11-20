// Hero input: on-screen joystick and attack button (touch or mouse), or WASD/arrows + Space on a keyboard.
// Movement is applied on this device (hero.ts), which reports the resulting position to the server.
import { attack } from './hero'

const joystick = { x: 0, y: 0 }
const keys = new Set<string>()

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

export function setJoystick(x: number, y: number) {
  joystick.x = x
  joystick.y = y
}

export { attack }

let started = false

export function startInput() {
  if (started) return
  started = true
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return
    if (KEY_DIRS[e.code]) keys.add(e.code)
    else if (e.code === 'Space' && !e.repeat) {
      e.preventDefault()
      attack()
    }
  })
  addEventListener('keyup', (e) => keys.delete(e.code))
  addEventListener('blur', () => keys.clear())
}
