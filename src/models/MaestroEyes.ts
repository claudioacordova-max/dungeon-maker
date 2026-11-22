import { MeshBasicMaterial } from 'three'
import { fold } from './Heroes'
import type { Part } from './kit'

type Point = [number, number]
const lid: Point[] = [[-.50,-.12],[-.14,.05],[.50,.48],[.36,.01],[.13,-.31],[-.14,-.37],[-.40,-.28]]
const core: Point[] = [[-.41,-.14],[-.09,.00],[.36,.30],[.22,-.03],[.05,-.21],[-.16,-.25]]

// The outer tip sweeps upward like the eyes in the lobby portrait.
export function eyeLayers(side: number) {
  return [lid, core].map((points, i) => ({
    points: points.map(([x,y]): Point => [side*x,y]),
    color: i ? '#fff394' : '#ff990f',
  }))
}
export const eyePaint = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })

export function maestroEyes(x: number, y: number, z: number, width: number, height: number, tilt: number): Part[] {
  return [-1,1].flatMap(side => eyeLayers(side).map(({ points, color }, i): Part => ({
    g: fold(points, .002), c: color, ink: false,
    p: [side*x, y + i*.002*Math.sin(tilt), z - i*.002*Math.cos(tilt)],
    s: [width,height,1], r: [tilt,0,0],
  })))
}

export function recolor(parts: Part[], palette: Record<string, string>) {
  return parts.map(p => ({ ...p, c: palette[p.c] ?? p.c }))
}
