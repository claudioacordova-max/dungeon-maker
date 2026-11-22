import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, BufferGeometry, Float32BufferAttribute, Matrix4, MeshBasicMaterial, type Group } from 'three'
import { BlobShadow } from './Effects'
import { loft } from './Enemies'
import { fold, ramp } from './Heroes'
import { bake, gem, toon, type Part, type V3 } from './kit'
import { eyePaint, maestroEyes } from './MaestroEyes'
import type { Pose } from './types'

// Each band follows the same folds. This keeps the gold binding on the hood lip
// even around its sharp peak and gives the robe a continuous, torn lower edge.
function band(inner: V3[], outer: V3[]) {
  const vertices: number[] = []
  for (let i = 0; i < inner.length; i++) {
    const j = (i+1) % inner.length
    vertices.push(...inner[i], ...inner[j], ...outer[i], ...inner[j], ...outer[j], ...outer[i])
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  g.computeVertexNormals()
  return g
}

const opening = [[.00,-.29],[.17,-.24],[.30,-.15],[.336,-.024],[.278,.105],
  [.086,.262],[-.14,.168],[-.269,.080],[-.345,-.044],[-.29,-.179],[-.144,-.246]]
const tilt = .58
const faceY = 1.258, faceZ = -.231
function hoodLoop(width: number, height: number, dx: number, dy: number, dz: number): V3[] {
  return opening.map(([x,y]) => [x*width + dx, faceY + y*height*Math.cos(tilt) + dy,
    faceZ + y*height*Math.sin(tilt) + dz])
}
const hoodRings = [
  hoodLoop(0,0,0,-.01,.028), hoodLoop(.88,.91,0,0,.022),
  hoodLoop(.93,.96,0,0,-.010), hoodLoop(1.05,1.08,0,0,-.013),
  hoodLoop(1.17,1.22,-.012,.038,.084), hoodLoop(1.02,1.04,-.015,.122,.218),
  hoodLoop(.73,.68,-.052,.212,.321), hoodLoop(.42,.35,-.170,.252,.365),
  hoodLoop(.21,.18,-.316,.205,.363), hoodLoop(0,0,-.424,.137,.334),
]
const hoodColors = ['#0c0714','#75351e','#ffc542','#662197','#8d2ac6','#7b20b5','#681a9e','#501879','#381154']
const hood: Part[] = hoodColors.map((c,i) => ({ g: band(hoodRings[i], hoodRings[i+1]), c, ink: false }))

function pleats(y: number, width: number, depth: number, ragged = 0): V3[] {
  return Array.from({ length: 16 }, (_,i) => {
    const a = i*Math.PI/8, ridge = i%2 ? .83 : 1
    return [Math.sin(a)*width*ridge, y + ragged*((i%2 ? .096 : 0) + .026*Math.cos(i*1.7)),
      -.01 - Math.cos(a)*depth*ridge]
  })
}
const drape = [pleats(.075,.381,.271,1), pleats(.32,.33,.235), pleats(.67,.225,.171),
  pleats(.90,.28,.199), pleats(1.038,.307,.185)]
const robe = bake([
  ...drape.slice(1).map((row,i) => ({ g: band(row, drape[i]), c: ['#542072','#622385','#6a2991','#792daa'][i] })),
  { g: loft([[.79,.21,.192],[.92,.365,.238],[1.015,.32,.201],[1.064,.184,.154]],10), c: '#852cac', ink: false },
  { g: fold([[-.41,.5],[.41,.5],[.37,-.27],[0,-.50],[-.42,-.22]],.10), c: '#8531ac',
    p: [0,.511,-.225], s: [.190,.660,.13], r: [.15,0,0], ink: false },
  { g: gem, c: '#ffbf43', p: [0,.915,-.235], s: [.092,.112,.038], ink: false },
  ...hood,
], .007)

// Sculpt one open hand in its bell sleeve. The opposite shoulder mirrors it.
const fingers: Part[] = Array.from({ length: 4 }, (_,i) => {
  const x = (i-1.5)*.048, length = [.132,.151,.143,.108][i]
  return { g: loft([[-length,.012,.014,-.062,x*.22],[-length*.65,.021,.023,-.084,x*.17],
    [-.024,.025,.028,-.047,x*.10],[.018,.022,.022]],5),
    c: i%2 ? '#ffcf92' : '#ffd7a2', p: [.126+x,-.106,-.347+Math.abs(x)*.16], ink: false }
})
const sleeve = bake([
  { g: loft([[-.160,.146,.128,-.198,.121],[-.094,.156,.135,-.173,.104],
    [.015,.128,.141,-.058,.058],[.067,.091,.085,0,0]],8), c: '#8029ad' },
  { g: loft([[-.167,.146,.121,-.20,.122],[-.142,.15,.129,-.193,.118]],8), c: '#b954d9', ink: false },
  { g: loft([[-.141,.080,.067,-.246,.122],[-.09,.093,.097,-.284,.123],
    [-.044,.089,.102,-.279,.124],[-.023,.059,.064,-.25,.121]],7), c: '#ffcd96' },
  ...fingers,
  { g: loft([[-.16,.014,.018,-.320,.000],[-.14,.027,.026,-.341,-.004],
    [-.085,.034,.035,-.304,.026],[-.065,.032,.041,-.266,.063]],5), c: '#ffd69d', ink: false },
], .006)
const eyes = bake(maestroEyes(.134,faceY,faceZ+.006,.173,.108,tilt),0)

type MasterProps = { pose: Pose; fade?: number | (() => number) }
function Maestro({ pose, fade = 0 }: { pose: Pose; fade?: number | (() => number) }) {
  const root = useRef<Group>(null), body = useRef<Group>(null), shadow = useRef<Group>(null)
  const left = useRef<Group>(null), right = useRef<Group>(null)
  // All four moving parts dissolve along the same rising edge in actor space.
  // The smoke can crossfade over this cutout without transparent sorting.
  const materials = useMemo(() => {
    const cloth = toon.clone(), eyes = eyePaint.clone()
    const ink = new MeshBasicMaterial({ color: '#24152f', side: BackSide })
    const fade = { value: 0 }, worldToActor = { value: new Matrix4() }
    for (const m of [cloth,ink,eyes]) m.onBeforeCompile = shader => {
      shader.uniforms.uFade = fade
      shader.uniforms.uWorldToActor = worldToActor
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uWorldToActor; varying vec3 vActor;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvActor = (uWorldToActor * modelMatrix * vec4(transformed, 1.)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uFade; varying vec3 vActor;')
        .replace('#include <opaque_fragment>', `
          if (uFade > 0.) {
            float grain = fract(sin(dot(floor(vActor * 66.), vec3(12.9898,78.233,39.425))) * 4375.85);
            float curl = .055 * sin(vActor.x*18. + vActor.z*11.) + .13 * (grain-.5);
            float edge = vActor.y + curl - mix(-.13,1.83,uFade);
            if (edge < 0.) discard;
            outgoingLight += vec3(.29,.024,.48) * (1.-smoothstep(0.,.055,edge));
          }
          #include <opaque_fragment>`)
    }
    return { cloth, ink, eyes, fade, worldToActor }
  }, [])
  useEffect(() => () => {
    materials.cloth.dispose()
    materials.ink.dispose()
    materials.eyes.dispose()
  }, [materials])
  useFrame(() => {
    const f = Math.min(1,Math.max(0,typeof fade === 'number' ? fade : fade()))
    root.current!.visible = f < 1
    if (f >= 1) return
    materials.fade.value = f
    if (f > 0) {
      root.current!.updateWorldMatrix(true,false)
      materials.worldToActor.value.copy(root.current!.matrixWorld).invert()
    }
    const { t, anim } = pose
    const gaze = anim === 'special' ? ramp(t,0,.94) : 0
    const gather = anim === 'attack' ? ramp(t,0,.14)*(1-ramp(t,.14,.26)) : 0
    const cast = anim === 'attack' ? ramp(t,.13,.24)*(1-ramp(t,.28,.55)) : 0
    const breath = Math.sin(t*2.15)
    body.current!.position.set(0,.027+.023*breath,-.015*gaze)
    body.current!.rotation.set(-.126*gaze-.083*cast,.021*Math.sin(t*1.55),.012*breath)
    shadow.current!.scale.setScalar((1-f)*(.98-.025*breath))
    materials.eyes.color.setScalar(.88+.12*breath+.71*gaze+.76*cast)
    for (const [arm,side] of [[left.current!,-1],[right.current!,1]] as const) {
      const drift = Math.sin(t*2.2+side*.46)
      arm.position.set(side*(.268+.037*gaze),.993+.011*drift+.096*gaze+.04*gather,-.024-.078*cast)
      arm.rotation.set(.05+.055*drift+.72*gaze+.65*gather+.28*cast,side*(.09*gaze+.26*gather-.21*cast),
        side*(.034*drift+.27*gaze+.16*gather))
    }
  })
  function fabric(shape: typeof robe) {
    return <><mesh geometry={shape.color} material={materials.cloth} />
      {shape.hull && <mesh geometry={shape.hull} material={materials.ink} />}</>
  }
  return <group ref={root} dispose={null}>
    <group ref={shadow}><BlobShadow radius={.43} /></group>
    <group ref={body}>
      {fabric(robe)}
      <mesh geometry={eyes.color} material={materials.eyes} />
      <group ref={left} scale-x={-1}>{fabric(sleeve)}</group>
      <group ref={right}>{fabric(sleeve)}</group>
    </group>
  </group>
}

export function MasterLord(props: MasterProps) { return <Maestro {...props} /> }
export function PreviewMasterFade({ pose }: { pose: Pose }) {
  return <Maestro pose={pose} fade={() => ramp(pose.t,.14,1.32)} />
}
