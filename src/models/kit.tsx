import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide, BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry,
  DataTexture, DynamicDrawUsage, Euler, Float32BufferAttribute, InstancedBufferAttribute,
  Matrix3, Matrix4, MeshBasicMaterial, MeshToonMaterial, NearestFilter,
  OctahedronGeometry, Quaternion, RedFormat, SphereGeometry, Vector3,
} from 'three'
import type { Pose } from './types'

export type V3 = [number, number, number]
export type Part = {
  g: BufferGeometry
  c: string
  p?: V3
  s?: V3
  r?: V3
  ink?: boolean
  accent?: boolean
  glow?: boolean
}

export const box = new BoxGeometry()
export const ball = new SphereGeometry(.5, 8, 5)
export const gem = new OctahedronGeometry(.5)
export const barrel = new CylinderGeometry(.5, .5, 1, 8)
export const cone = new ConeGeometry(.5, 1, 8)

const gradient = new DataTexture(new Uint8Array([40, 110, 190, 255]), 4, 1, RedFormat)
gradient.minFilter = gradient.magFilter = NearestFilter
gradient.needsUpdate = true
export const toon = new MeshToonMaterial({ vertexColors: true, gradientMap: gradient })
const outline = new MeshBasicMaterial({ color: '#211c37', side: BackSide })

// Join the coloured pieces around a single animation pivot. Expand each inked
// solid around its own bounds so the back-face hull stays closed at hard edges.
function assemble(parts: Part[], thickness: number) {
  const positions: number[] = [], normals: number[] = [], colors: number[] = []
  const masks: number[] = [], indices: number[] = []
  const vertex = new Vector3(), location = new Vector3(), size = new Vector3()
  const center = new Vector3(), extent = new Vector3(), rotation = new Euler()
  const matrix = new Matrix4(), normalMatrix = new Matrix3(), q = new Quaternion()
  const paint = new Color()
  for (const part of parts) {
    if (thickness && part.ink === false) continue
    const g = part.g
    const pos = g.getAttribute('position'), norm = g.getAttribute('normal')
    const pigment = g.getAttribute('color')
    const offset = positions.length / 3
    location.fromArray(part.p ?? [0, 0, 0])
    size.fromArray(part.s ?? [1, 1, 1])
    rotation.set(...(part.r ?? [0, 0, 0]))
    matrix.compose(location, q.setFromEuler(rotation), size)
    normalMatrix.getNormalMatrix(matrix)
    if (thickness) {
      if (!g.boundingBox) g.computeBoundingBox()
      g.boundingBox!.getCenter(center)
      g.boundingBox!.getSize(extent).multiply(size)
      extent.set(
        1 + 2 * thickness / Math.max(.04, Math.abs(extent.x)),
        1 + 2 * thickness / Math.max(.04, Math.abs(extent.y)),
        1 + 2 * thickness / Math.max(.04, Math.abs(extent.z)),
      )
    }
    paint.set(part.c)
    for (let i = 0; i < pos.count; i++) {
      vertex.fromBufferAttribute(pos, i)
      if (thickness) vertex.sub(center).multiply(extent).add(center)
      vertex.applyMatrix4(matrix)
      positions.push(vertex.x, vertex.y, vertex.z)
      if (thickness) continue
      vertex.fromBufferAttribute(norm, i).applyNormalMatrix(normalMatrix)
      normals.push(vertex.x, vertex.y, vertex.z)
      colors.push(paint.r * (pigment?.getX(i) ?? 1), paint.g * (pigment?.getY(i) ?? 1), paint.b * (pigment?.getZ(i) ?? 1))
      masks.push(Number(!!part.accent), Number(!!part.glow))
    }
    for (let i = 0; i < (g.index?.count ?? pos.count); i++)
      indices.push(offset + (g.index?.getX(i) ?? i))
  }
  const combined = new BufferGeometry()
  combined.setIndex(indices)
  combined.setAttribute('position', new Float32BufferAttribute(positions, 3))
  if (!thickness) {
    combined.setAttribute('normal', new Float32BufferAttribute(normals, 3))
    combined.setAttribute('color', new Float32BufferAttribute(colors, 3))
    combined.setAttribute('artMask', new Float32BufferAttribute(masks, 2))
  }
  return combined
}

export function bake(parts: Part[], thickness = .015) {
  return {
    color: assemble(parts, 0),
    hull: thickness > 0 && parts.some(p => p.ink !== false) ? assemble(parts, thickness) : null,
  }
}

// Each moving batch is a one-instance mesh. Three binds instanceColor per
// object, allowing two models to flash or charge independently while sharing
// the exact same geometry, material and shader program.
const skin = toon.clone()
skin.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      attribute vec2 artMask;
      varying vec2 vPulse;`)
    .replace('#include <color_vertex>', `
      vec3 tint = mod(floor(instanceColor.x / vec3(65536., 256., 1.)), 256.) / 255.;
      vColor = vec4(color * mix(vec3(1.), tint, artMask.x), 1.);
      vPulse = instanceColor.yz * vec2(1., artMask.y);`)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vPulse;')
    .replace('#include <opaque_fragment>', `
      outgoingLight += vPulse.y * (vec3(.35) + diffuseColor.rgb * 1.5);
      outgoingLight = mix(outgoingLight, vec3(2.), vPulse.x);
      #include <opaque_fragment>`)
}
const animatedInk = outline.clone()
animatedInk.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', 'vColor = vec4(1.); vHit = instanceColor.y;')
    .replace('#include <common>', '#include <common>\nvarying float vHit;')
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHit;')
    .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, vec3(2.), vHit);\n#include <opaque_fragment>')
}

type BatchProps = { shape: ReturnType<typeof bake>; pose?: Pose; tint?: string }

function PosedBatch({ shape, pose, tint = '#ffffff' }: BatchProps & { pose: Pose }) {
  const packedTint = useMemo(() => {
    const c = new Color(tint)
    return Math.round(c.r * 255) * 65536 + Math.round(c.g * 255) * 256 + Math.round(c.b * 255)
  }, [tint])
  const data = useMemo(() => new InstancedBufferAttribute(new Float32Array(3), 3)
    .setUsage(DynamicDrawUsage), [])
  useFrame(() => {
    const charge = pose.anim === 'charge' || pose.anim === 'windup' ? pose.charge : 0
    if (data.getX(0) !== packedTint || Math.abs(data.getY(0) - pose.flash) + Math.abs(data.getZ(0) - charge) > .00001) {
      data.setXYZ(0, packedTint, pose.flash, charge)
      data.needsUpdate = true
    }
  })
  return <>
    <instancedMesh args={[shape.color, skin, 1]} instanceColor={data} />
    {shape.hull && <instancedMesh args={[shape.hull, animatedInk, 1]} instanceColor={data} />}
  </>
}

export function Batch(props: BatchProps) {
  if (props.pose) return <PosedBatch {...props} pose={props.pose} />
  return <group dispose={null}>
    <mesh geometry={props.shape.color} material={toon} />
    {props.shape.hull && <mesh geometry={props.shape.hull} material={outline} />}
  </group>
}
