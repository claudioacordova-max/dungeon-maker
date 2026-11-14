import { create } from 'zustand'

// Screen state machine: title -> playing <-> paused -> gameover -> playing | title.
export type Screen = 'title' | 'playing' | 'paused' | 'gameover'

type GameState = {
  screen: Screen
  // Placeholder state that only exercises the shell. Replace with the game's real state.
  elapsed: number
  hits: number
  start: () => void
  togglePause: () => void
  endGame: () => void
  toTitle: () => void
  tick: (delta: number) => void
  hit: () => void
}

const freshRun = { elapsed: 0, hits: 0 }
const MAX_STEP = 0.1 // seconds

// Read in components with useGame(selector); outside React with useGame.getState().
export const useGame = create<GameState>()((set) => ({
  screen: 'title',
  ...freshRun,
  start: () => set({ screen: 'playing', ...freshRun }),
  togglePause: () =>
    set((s) =>
      s.screen === 'playing' ? { screen: 'paused' } : s.screen === 'paused' ? { screen: 'playing' } : {},
    ),
  endGame: () => set({ screen: 'gameover' }),
  toTitle: () => set({ screen: 'title', ...freshRun }),
  // Clamp the frame step so a throttled background tab does not add a huge jump.
  tick: (delta) =>
    set((s) => (s.screen === 'playing' ? { elapsed: s.elapsed + Math.min(delta, MAX_STEP) } : {})),
  hit: () => set((s) => (s.screen === 'playing' ? { hits: s.hits + 1 } : {})),
}))
