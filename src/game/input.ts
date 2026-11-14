import type { KeyboardControlsEntry } from '@react-three/drei'
import { useGame } from './store'

// Add the game's actions here; read held keys in the scene with useKeyboardControls().
export enum Control {
  pause = 'pause',
}

// `up: false` = one-shot: drei fires onChange(true) once per physical press, not on key repeat.
export const keyMap: KeyboardControlsEntry<Control>[] = [{ name: Control.pause, keys: ['Escape'], up: false }]

// One-shot actions on key press. Screen buttons handle Enter/Space natively.
// Touch (mobile targets; see target.ts): there is no key map. Add on-screen controls (>= 44 design px) or R3F
// pointer handlers on scene meshes that call the same store actions, e.g. onPointerDown={() => useGame.getState().hit()}.
export function onControlChange(name: string, pressed: boolean) {
  if (pressed && name === Control.pause) useGame.getState().togglePause()
}
