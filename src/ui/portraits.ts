import { create } from 'zustand'
import type { Placeable } from '../shared/protocol'

// Small pictures of the enemies for the Maestro's buttons, taken once from the real 3D models (EnemyPortraits.tsx).
// Kept apart from that file so the menus do not load three.js for them.
export const usePortraits = create<{ urls: Partial<Record<Placeable, string>>; done: boolean }>()(() => ({ urls: {}, done: false }))
