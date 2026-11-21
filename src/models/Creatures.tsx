import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { TetrahedronGeometry, type Group } from 'three'
import { BlobShadow } from './Effects'
import { loft } from './Enemies'
import { band, beveled, diamond, face, fold, paint, part, ramp, shell, taper } from './Heroes'
import { Batch, bake, ball, box, cone, gem, type Part } from './kit'
import type { Pose } from './types'

const hide = '#849b77', moss = '#687f67', sage = '#9eb180', tooth = '#ffe8ac'
const leather = '#7d4d41', belt = '#513b40', bronze = '#cd915b', ink = '#302a37'
const chest = shell([[.47,.67,.54],[.61,.80,.62],[.88,1.01,.68],[1.19,1.21,.69,.027],[1.36,.90,.52,.045]])
const jaw = shell([[-.50,.72,.77],[-.32,1,1],[.30,1,1],[.50,.90,.83]])
const pelt = fold([[-.5,.5],[.49,.5],[.45,-.11],[.28,-.05],[.14,-.40],[-.02,-.28],[-.21,-.50],[-.44,-.16]], .085)
// Broad five-sided cuts give the limbs mass without spending a second hull on every knuckle.
function carved(profile: Parameters<typeof loft>[0], sides = 5) {
  const geometry = loft(profile, sides).rotateY(Math.PI/sides).toNonIndexed()
  geometry.computeVertexNormals()
  return geometry
}
const knuckle = carved([[-.5,.47,.46],[.22,.52,.53],[.5,.44,.43]])
const cuff = carved([[-.5,.46,.48],[.5,.5,.5]])
const tusk = carved([[0,.064,.062],[.082,.053,.051,-.024],[.17,.030,.031,-.025],[.228,.005,.007,-.006]])
const ogreBody = bake([
  part(chest, hide, [0,0,0], [1,1,1]),
  paint(band, leather, [0,.575,.02], [.85,.26,.66]),
  part(pelt, '#a36345', [-.043,.465,-.32], [.43,.46,.34], [-.16,0,-.07]),
  paint(pelt, '#8b513c', [0,.468,.32], [.52,.42,.28], [.18,Math.PI,0]),
  paint(band, belt, [0,.681,0], [.905,.132,.665]),
  paint(box, bronze, [0,.682,-.338], [.19,.135,.042]),
  paint(box, belt, [0,.680,-.362], [.117,.072,.020]),
  paint(box, leather, [.10,1.03,-.334], [.159,.68,.043], [0,0,-.72]),
  paint(box, leather, [.10,1.03,.339], [.159,.66,.043], [0,0,-.72]),
  paint(diamond, bronze, [.11,1.045,-.368], [.115,.135,.044]),
  // The free fist and shoulder stay in the chest batch. The club side has its own pivot.
  part(knuckle, moss, [-.504,1.172,.012], [.39,.41,.46], [0,0,-.21]),
  paint(cuff, hide, [-.564,.985,-.048], [.302,.36,.36], [.20,0,-.17]),
  paint(cuff, leather, [-.587,.87,-.078], [.318,.12,.36], [.20,0,-.17]),
  paint(knuckle, sage, [-.59,.788,-.131], [.304,.24,.34], [.15,0,-.13]),
  paint(knuckle, '#70524b', [.456,1.234,.035], [.386,.27,.45], [.06,0,-.26]),
  part(face, moss, [0,1.54,-.046], [.75,.54,.57], [.18,0,0]),
  part(jaw, hide, [0,1.408,-.198], [.636,.309,.453], [.17,0,0]),
  paint(box, ink, [0,1.462,-.413], [.424,.039,.046], [.18,0,-.024]),
  paint(knuckle, sage, [0,1.552,-.361], [.234,.161,.176], [.20,0,0]),
  ...[-1,1].flatMap((side): Part[] => [
    paint(gem, hide, [side*.378,1.556,-.022], [.251,.166,.211], [0,0,side*.31]),
    paint(gem, '#b49c82', [side*.411,1.57,-.089], [.096,.071,.054]),
    paint(tusk, tooth, [side*.224,1.40,-.405], [1,1,1], [.10,0,-side*.20]),
    paint(box, ink, [side*.166,1.615,-.312], [.173,.099,.060], [.24,0,side*.17]),
    paint(box, '#ffd375', [side*.165,1.616,-.348], [.127,.064,.025], [.24,0,side*.17]),
    paint(box, ink, [side*.15,1.617,-.362], [.043,.057,.018], [.24,0,0]),
    paint(knuckle, sage, [side*.168,1.677,-.297], [.248,.102,.14], [.24,0,side*.23]),
    paint(gem, '#465c53', [side*.126,1.776,.014], [.25,.136,.29], [-.16,0,-side*.18]),
  ]),
  paint(gem, '#52675a', [0,1.804,.035], [.20,.146,.30], [-.2,0,.1]),
], .019)
const ogreLeg = bake([
  paint(knuckle, moss, [0,-.096,.04], [.308,.33,.354]),
  paint(cuff, leather, [0,-.251,.005], [.316,.104,.347]),
  paint(knuckle, hide, [0,-.342,-.040], [.345,.199,.464]),
  ...[-1,0,1].map(i => paint(gem, '#d2c39b', [i*.092,-.367,-.241], [.084,.059,.081])),
], 0)
// The grip and barrel are carved along -Z. Rotating the shoulder lifts the whole club overhead.
const clubHead = carved([[-.34,.071,.07],[-.12,.154,.148],[.19,.20,.185],[.33,.138,.127]],6)
const clubHoop = carved([[-.5,.5,.5],[.5,.5,.5]],6)
const club = bake([
  part(knuckle, hide, [.033,-.071,-.027], [.346,.353,.38], [.31,0,.19]),
  paint(cuff, leather, [.09,-.163,-.104], [.30,.119,.315], [.48,0,.20]),
  paint(knuckle, sage, [.115,-.192,-.205], [.31,.251,.28], [.40,0,.15]),
  paint(cuff, '#85523c', [.128,-.173,-.38], [.102,.66,.115], [-Math.PI/2,0,0]),
  paint(cuff, bronze, [.128,-.173,-.103], [.128,.070,.141], [-Math.PI/2,0,0]),
  part(clubHead, '#a46c47', [.128,-.173,-.83], [1.13,1.20,1.15], [-Math.PI/2,0,0]),
  paint(clubHoop, '#694b46', [.128,-.173,-.79], [.427,.098,.408], [-Math.PI/2,0,0]),
  paint(clubHoop, bronze, [.128,-.173,-1.104], [.45,.065,.424], [-Math.PI/2,0,0]),
  paint(gem, '#c99156', [.128,-.173,-1.229], [.252,.218,.034]),
  paint(gem, '#da9e61', [.29,-.154,-.94], [.139,.121,.148]),
], .015)
const impactParts: Part[] = []
const crack = fold([[0,-.50],[-.44,.14],[.13,.5],[.47,.16]],0).rotateX(Math.PI/2)
const grit = new TetrahedronGeometry(.5)
for (let i = 0; i < 6; i++) {
  const a = i*Math.PI/3+.22, reach = .24+(i%3)*.045
  impactParts.push(
    paint(crack, '#654849', [Math.sin(a)*reach,.022,Math.cos(a)*reach], [.055,1,reach*1.8], [0,a,0]),
    paint(grit, i%2 ? '#cca482' : '#a98e7c', [Math.sin(a)*.39,.060+.032*(i%3),Math.cos(a)*.39],
      [.109,.086,.119], [.28,a,.3]),
  )
}
const impact = bake(impactParts,0)

export function Ogre({ pose }: { pose: Pose }) {
  const body = useRef<Group>(null), hand = useRef<Group>(null), dust = useRef<Group>(null)
  const left = useRef<Group>(null), right = useRef<Group>(null)
  useFrame(() => {
    const { anim, t } = pose
    const step = anim === 'run' ? Math.sin(t*8.8) : 0
    const stamp = Math.abs(step)
    const windup = anim === 'windup' ? ramp(t,0,.80) : 0
    const land = anim === 'land'
    const strike = land ? ramp(t,0,.14) : 0
    const recovery = land ? ramp(t,.22,.51) : 0
    const slam = strike*(1-recovery)
    const raised = windup + (land ? (1-strike) : 0)
    const hurt = anim === 'hurt' ? ramp(t,0,.055)*(1-ramp(t,.07,.32)) : 0
    const fall = anim === 'die' ? ramp(t,0,.50) : 0
    const root = body.current!, arm = hand.current!
    root.position.set(.043*step, .012 + .011*Math.sin(t*2.6)*(1-fall) + .062*stamp + .12*fall, -.082*slam)
    root.rotation.set(-.063*stamp + .094*raised - .15*slam + .18*hurt, -.11*step + .18*raised, .069*step + .17*hurt - 1.42*fall)
    root.scale.set(1+.045*slam,1-.072*slam,1+.04*slam)
    left.current!.rotation.x = .56*step
    right.current!.rotation.x = -.56*step
    left.current!.position.y = .441 + .073*Math.max(0,step)
    right.current!.position.y = .441 + .073*Math.max(0,-step)
    arm.position.set(.473-.12*raised,1.217+.060*raised-.063*slam,-.026)
    arm.rotation.set(.24+.14*step+1.55*raised-1.22*slam, -.42*(1-raised)*(1-slam), -.07, 'YXZ')
    const fx = dust.current!
    fx.visible = land && t >= .122 && t < .43
    if (fx.visible) {
      const p = (t-.122)/.308
      fx.scale.setScalar((.55+.8*ramp(p,0,.45))*(1-ramp(p,.65,1)))
    }
  })
  return <group dispose={null}>
    <BlobShadow radius={.75} />
    <group ref={body}>
      <Batch shape={ogreBody} pose={pose} />
      <group ref={left} position={[-.235,.441,0]}><Batch shape={ogreLeg} pose={pose} /></group>
      <group ref={right} position={[.235,.441,0]}><Batch shape={ogreLeg} pose={pose} /></group>
      <group ref={hand} position={[.473,1.217,-.026]}><Batch shape={club} pose={pose} /></group>
    </group>
    <group ref={dust} position={[.60,0,-.66]} visible={false}><Batch shape={impact} /></group>
  </group>
}

const feather = '#fff6d9', shade = '#e4dbcd', rouge = '#e7554b'
const bird = bake([
  part(ball, feather, [0,.213,.027], [.355,.283,.405], [-.22,0,0]),
  paint(taper, shade, [0,.273,.184], [.157,.174,.26], [.52,0,.05]),
  ...[-1,0,1].map(i => paint(gem, i===0 ? feather : shade, [i*.054,.314,.186+.016*(1-Math.abs(i))],
    [.073,.207,.077], [.57,0,-i*.31])),
], .008)
const birdHead = bake([
  paint(beveled, feather, [0,.068,-.016], [.222,.206,.205], [-.12,0,0]),
  paint(cone, '#ffb247', [0,.05,-.126], [.109,.128,.084], [-1.51,0,0]),
  paint(gem, rouge, [.011,.007,-.098], [.065,.113,.071], [-.11,0,-.18]),
  ...[-1,0,1].map(i => paint(gem, rouge, [i*.010,.184-Math.abs(i)*.015,i*.038-.012],
    [.054,.102,.071], [.20,0,.1*i])),
  ...[-1,1].flatMap((side): Part[] => [
    paint(ball, '#fffdf0', [side*.084,.097,-.078], [.093,.094,.079]),
    paint(gem, ink, [side*.103,.107,-.104], [.045,.057,.044]),
  ]),
], 0)
const wing = bake([
  paint(taper, shade, [0,-.034,.012], [.083,.174,.40], [-.33,-1.1,0]),
  paint(gem, feather, [0,-.013,-.002], [.083,.139,.155], [-.4,0,0]),
], 0)
const foot = bake([
  paint(box, '#d4833c', [0,-.041,0], [.025,.085,.028]),
  ...[-1,0,1].map(i => paint(box, '#f7ab48', [i*.018,-.082,-.022], [.021,.021,.077], [0,-i*.45,0])),
], 0)

export function Chicken({ pose, scale = 1 }: { pose: Pose; scale?: number }) {
  const body = useRef<Group>(null), neck = useRef<Group>(null)
  const leftWing = useRef<Group>(null), rightWing = useRef<Group>(null)
  const leftFoot = useRef<Group>(null), rightFoot = useRef<Group>(null)
  useFrame(() => {
    const { anim, t } = pose
    const running = anim === 'run', step = running ? Math.sin(t*22) : 0
    const peck = anim === 'idle' ? Math.max(0,Math.sin(t*4.3))**7 : 0
    const flap = running ? .90 + .74*Math.sin(t*31) : .09
    const hurt = anim === 'hurt' ? ramp(t,0,.04)*(1-ramp(t,.055,.24)) : 0
    const fall = anim === 'die' ? ramp(t,0,.31) : 0
    body.current!.position.set(step*.012, .004 + .033*Math.abs(step) + .101*fall, 0)
    body.current!.rotation.set(-.55*peck - .12*Math.abs(step)+.24*hurt, step*.085, .15*step+.23*hurt-1.55*fall)
    neck.current!.rotation.set(-.84*peck+.11*step+.20*hurt, .14*Math.sin(t*3)*(1-fall), -.06)
    leftWing.current!.rotation.z = -flap-.79*hurt
    rightWing.current!.rotation.z = flap+.79*hurt
    leftFoot.current!.rotation.x = step*.87
    rightFoot.current!.rotation.x = -step*.87
  })
  return <group scale={scale} dispose={null}>
    <BlobShadow radius={.222} />
    <group ref={body}>
      <Batch shape={bird} pose={pose} />
      <group ref={neck} position={[0,.26,-.114]}><Batch shape={birdHead} pose={pose} /></group>
      <group ref={leftWing} position={[-.145,.265,.014]}><Batch shape={wing} pose={pose} /></group>
      <group ref={rightWing} position={[.145,.265,.014]}><Batch shape={wing} pose={pose} /></group>
      <group ref={leftFoot} position={[-.066,.093,-.012]}><Batch shape={foot} pose={pose} /></group>
      <group ref={rightFoot} position={[.066,.093,-.012]}><Batch shape={foot} pose={pose} /></group>
    </group>
  </group>
}
