import { unlockAudio } from '../audio/sfx'

// Hero input. Touch/mouse: a floating movement stick (left) and an attack stick (right): tap = attack with
// auto-aim, drag = aim by hand, hold = charge the powered attack (released on lift). Keyboard: WASD/arrows to
// move, Space held to charge (auto-aim). Directions use the game's axes: +x east, +y north (up the screen).

const move = { x: 0, y: 0 }
const attack = { held: false, aiming: false, dir: 0 }
const keys = new Set<string>()
let spaceHeld = false

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
  if (move.x !== 0 || move.y !== 0) return move
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

export function attackInput(): { held: boolean; aiming: boolean; dir: number } {
  if (spaceHeld && !attack.held) return { held: true, aiming: false, dir: 0 }
  return attack
}

export function setMoveStick(x: number, y: number) {
  move.x = x
  move.y = y
}

export function setAttackStick(held: boolean, aiming: boolean, dir: number) {
  attack.held = held
  attack.aiming = aiming
  attack.dir = dir
}

let started = false

export function startInput() {
  if (started) return
  started = true
  // Browsers allow sound only after a gesture: unlock it on the first touch, click or key.
  addEventListener('pointerdown', unlockAudio, { capture: true })
  addEventListener('keydown', unlockAudio, { capture: true })
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return
    if (KEY_DIRS[e.code]) keys.add(e.code)
    else if (e.code === 'Space') {
      e.preventDefault()
      spaceHeld = true
    }
  })
  addEventListener('keyup', (e) => {
    keys.delete(e.code)
    if (e.code === 'Space') spaceHeld = false
  })
  addEventListener('blur', () => {
    keys.clear()
    spaceHeld = false
  })
}
