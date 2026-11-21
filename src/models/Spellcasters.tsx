import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { TorusGeometry, Vector3, type Group, type Mesh, type Sprite } from 'three'
import { BlobShadow } from './Effects'
import { band, beveled, diamond, eyes, face, fold, liftVisor, lit, paint, part, ramp, shell, taper, team, toe } from './Heroes'
import { Batch, bake, barrel, box, gem, type Part } from './kit'
import { lightHalo, spellPaint, spellShapes } from './MagicEffects'
import type { Pose } from './types'

const ivory = '#fff1cf', gold = '#ffc458', honey = '#e7a84e', skin = '#e9a875'
const violet = '#5c419b', plum = '#56355f', white = '#fffae9', silver = '#cfcadd'
const ear = fold([[-.48,-.42],[.12,-.20],[.50,.50],[-.41,.16]], .21)
const lock = fold([[-.48,.33],[-.15,.50],[.45,.32],[.32,-.20],[-.22,-.50],[-.33,-.10]], .22)
const robe = shell([[.125,.48,.33,.035],[.19,.49,.35,.027],[.385,.33,.25],[.53,.41,.28],[.60,.30,.23]])
const hem = shell([[.14,.492,.35,.032],[.174,.50,.357,.030]])
const cap = shell([[.855,.47,.404,.008],[.925,.49,.413,.015],[1.006,.348,.31,.032],[1.032,.16,.18,.056]])
const brim = shell([[-.022,.68,.51],[.009,.69,.53],[.045,.46,.37,.012]])
const hat = shell([[0,.46,.38],[.13,.32,.29,.027],[.22,.18,.17,.048,-.053],
  [.255,.12,.12,.061,-.138],[.235,.063,.072,.068,-.202],[.188,.010,.014,.069,-.237]])

function vestments(priest: boolean): Part[] {
  const cloth = priest ? ivory : violet
  return [
    part(robe, cloth, [0,0,0], [1,1,1]),
    paint(hem, gold, [0,0,0], [1,1,1]),
    paint(taper, gold, [0,.25,-.145], [.191,.244,.14], [-.27,0,-.05]),
    team(paint(taper, white, [0,.258,-.151], [.155,.228,.145], [-.27,0,-.05])),
    team(paint(band, white, [0,.382,.001], [.36,.080,.273], [0,0,-.055])),
    paint(diamond, gold, [.027,.388,-.150], [.102,.084,.055]),
    paint(band, gold, [0,.542,.002], [.43,.095,.294]),
    paint(band, priest ? '#e8d8b6' : plum, [0,.565,0], [.437,.088,.297]),
    paint(diamond, priest ? gold : '#f28fb5', [0,.521,-.155], [.090,.121,.06]),
  ]
}

const priestBody = bake([...vestments(true), ...liftVisor([
  paint(beveled, honey, [0,.766,.077], [.49,.46,.37]),
  paint(taper, ivory, [0,.692,.218], [.356,.46,.43], [-.20,Math.PI,0]),
  part(face, skin, [0,.782,-.042], [.431,.305,.36]),
  ...eyes(.803,-.227,.11),
  paint(gem, '#f9ba82', [0,.762,-.225], [.069,.051,.058]),
  paint(box, '#995951', [0,.716,-.208], [.055,.013,.024]),
  ...[-1,1].flatMap((side): Part[] => [
    part(ear, skin, [side*.275,.821,-.006], [.215,.172,.24], [0,side===1 ? 0 : Math.PI,0]),
    paint(ear, '#ce8174', [side*.282,.826,-.045], [.132,.092,.071], [0,side===1 ? 0 : Math.PI,0]),
    paint(lock, '#ce8746', [side*.202,.679,-.129], [.159,.42,.36], [-.18,side*.38,side*.13]),
    paint(lock, '#f2b456', [side*.207,.705,-.170], [.097,.348,.24], [-.18,side*.38,side*.13]),
    paint(lock, honey, [side*.180,.648,.14], [.165,.38,.35], [.19,side*.29,-side*.14]),
  ]),
  part(cap, ivory, [0,.017,.042], [1,1,1]),
  paint(band, gold, [0,.906,.042], [.487,.043,.424]),
  paint(lock, '#e9aa57', [-.073,.889,-.161], [.258,.145,.35], [.24,0,-.35]),
  paint(lock, '#f6c16d', [.118,.872,-.154], [.178,.13,.33], [.24,0,.33]),
  paint(diamond, gold, [0,.956,-.148], [.128,.106,.15], [.45,0,0]),
  team(paint(diamond, white, [0,.956,-.169], [.069,.065,.10], [.45,0,0])),
], .19), ...[-1,1].map(side => paint(gem, ivory, [side*.19,.545,-.018], [.18,.145,.24]))], .012)

const mageBody = bake([...vestments(false), ...liftVisor([
  part(face, '#d99a72', [0,.765,-.032], [.448,.294,.363]),
  ...eyes(.792,-.218,.16),
  paint(taper, silver, [0,.600,-.213], [.358,.328,.36], [.32,0,0]),
  paint(lock, white, [-.027,.573,-.256], [.228,.382,.32], [.29,0,-.10]),
  paint(lock, '#e8e2da', [.094,.613,-.241], [.162,.294,.29], [.31,0,.17]),
  ...[-1,1].flatMap((side): Part[] => [
    paint(lock, silver, [side*.186,.738,.045], [.127,.224,.445], [0,side*.46,side*.2]),
    paint(taper, white, [side*.10,.836,-.208], [.173,.065,.16], [.24,0,side*.23]),
    paint(lock, white, [side*.070,.715,-.226], [.141,.083,.16], [0,0,side*.40]),
  ]),
  paint(beveled, '#ebb382', [0,.759,-.227], [.094,.081,.088]),
  part(brim, violet, [0,.880,.009], [1,1,1], [.18,0,.047]),
  part(hat, '#6748ac', [0,.905,.011], [1,1,1], [.105,0,.047]),
  paint(band, gold, [0,.94,.014], [.427,.050,.378], [.105,0,.047]),
  team(paint(diamond, white, [.024,.943,-.18], [.083,.078,.079], [.2,0,0])),
], .18)], .012)

const shoe = bake([
  paint(box, '#624550', [0,-.065,.009], [.126,.152,.137]),
  paint(toe, '#815442', [0,-.142,-.029], [.145,.10,.197]),
  paint(box, gold, [0,-.118,-.105], [.073,.029,.024]),
], 0)
const staffTip = new Vector3(.122,.423,-.115)
const nimbus = new TorusGeometry(.090,.015,3,10)
function arm(priest: boolean, armed: boolean) {
  const side = armed ? 1 : -1
  const sleeve = priest ? ivory : violet
  const parts = [
    paint(band, sleeve, [side*.030,-.052,-.024], [.153,.17,.161], [.33,0,side*.38]),
    paint(band, gold, [side*.061,-.107,-.053], [.159,.045,.162], [.33,0,side*.38]),
    paint(beveled, skin, [side*.083,-.118,-.088], [.124,.115,.13]),
  ]
  if (armed) {
    parts.push(
      paint(barrel, priest ? '#a66d40' : '#84513d', [.122,.016,-.115], [.052,.87,.052]),
      paint(barrel, gold, [.122,-.351,-.115], [.060,.047,.061]),
      paint(barrel, gold, [.122,.292,-.115], [.072,.049,.072]),
    )
    if (priest) {
      parts.push(paint(nimbus, gold, [.122,.423,-.115], [1,1,1], [.23,0,0]),
        lit(paint(gem, '#fff6b0', [.122,.423,-.115], [.121,.164,.112])))
      for (let i = 0; i < 5; i++) {
        const a = i*2*Math.PI/5
        parts.push(paint(diamond, gold, [.122+.101*Math.cos(a),.423+.101*Math.sin(a),-.115], [.058,.039,.075], [0,0,a]))
      }
    } else {
      for (const fork of [-1,1]) parts.push(paint(taper, '#965a40',
        [.122+fork*.05,.363,-.105], [.055,.166,.16], [0,0,-fork*.39]))
      parts.push(lit(paint(gem, '#ff433e', [.122,.423,-.115], [.144,.235,.135], [.08,0,-.17])),
        paint(diamond, '#ffad69', [.101,.442,-.161], [.057,.121,.060], [.15,0,-.18]))
    }
  }
  return bake(parts, 0)
}
const priestArms = [arm(true,false), arm(true,true)]
const mageArms = [arm(false,false), arm(false,true)]
type HeroProps = { pose: Pose; tint: string }

function Caster({ pose, tint, priest }: HeroProps & { priest: boolean }) {
  const torso = useRef<Group>(null), left = useRef<Group>(null), right = useRef<Group>(null)
  const palm = useRef<Group>(null), staff = useRef<Group>(null), magic = useRef<Mesh>(null)
  const halo = useRef<Sprite>(null)
  const arms = priest ? priestArms : mageArms
  useFrame(() => {
    const { anim, t } = pose
    const step = anim === 'run' ? Math.sin(t*14) : 0
    const breath = Math.sin(t*3.3)
    const hurt = anim === 'hurt' ? ramp(t,0,.045)*(1-ramp(t,.06,.26)) : 0
    const death = anim === 'die' ? ramp(t,0,.38) : 0
    const charge = anim === 'charge' ? Math.min(1, Math.max(0,pose.charge)) : 0
    const basic = anim === 'attack' ? ramp(t,0,.075)*(1-ramp(t,.15,.32)) : 0
    const special = anim === 'special' ? ramp(t,0,.10)*(1-ramp(t,.30,.52)) : 0
    const prayer = priest ? special : 0, thrust = priest ? 0 : special
    const raise = (anim === 'charge' ? .2 + .8*charge : 0) + prayer
    const body = torso.current!, hand = staff.current!, open = palm.current!
    body.position.set(step*.015, .008 + .006*breath + Math.abs(step)*.040 + .13*death, -.063*thrust)
    body.rotation.set(-.080*Math.abs(step) - .16*thrust + .24*hurt, -.15*basic-.22*thrust, .05*step+.19*hurt-1.48*death)
    left.current!.rotation.x = step*.74
    right.current!.rotation.x = -step*.74
    left.current!.position.y = .19+.035*Math.max(0,step)
    right.current!.position.y = .19+.035*Math.max(0,-step)
    hand.position.set(.195 + .06*raise + .035*prayer, .537 + .12*raise, -.017 - .095*thrust - .07*prayer)
    hand.rotation.set(-.17 - .15*step - basic*1.12 - thrust*1.33 + 1.06*prayer, .12*basic, -.14 + raise*.31 - .47*prayer)
    open.position.set(-.20-.055*prayer, .538+.095*prayer, -.016-.12*prayer)
    open.rotation.set(.13*step+.46*basic, 0, -.08 - .62*charge - 1.65*prayer + .31*thrust)
    const fx = magic.current!
    const releasing = (anim === 'attack' || anim === 'special') && t >= .07 && t < .35
    fx.visible = (!priest && anim === 'charge') || releasing
    if (halo.current) {
      halo.current.visible = !releasing && anim !== 'die'
      halo.current.scale.setScalar(.30 + .37*charge + .018*Math.sin(t*10))
    }
    if (!fx.visible) return
    const flight = Math.max(0, Math.min(1, (t-.07)/.28))
    fx.position.copy(staffTip).applyEuler(hand.rotation).add(hand.position)
    fx.rotation.set(0,0,t*(priest ? 4 : 10))
    if (anim === 'special' && priest) {
      fx.geometry = spellShapes.prayer
      fx.position.set(0,.57+.16*flight,0)
      fx.scale.setScalar(.65 + .85*flight)
    } else {
      fx.geometry = priest ? spellShapes.light : anim === 'attack' ? spellShapes.fire : spellShapes.poly
      if (releasing) fx.position.z -= .78*flight
      fx.scale.setScalar(releasing ? (.52 + .33*Math.sin(Math.PI*flight))*(1-ramp(flight,.78,1))
        : (.23 + .77*charge)*(1+.04*Math.sin(t*19)))
    }
  })
  return <group dispose={null}>
    <BlobShadow radius={.35} />
    <group ref={torso}>
      <Batch shape={priest ? priestBody : mageBody} pose={pose} tint={tint} />
      <group ref={left} position={[-.102,.19,0]}><Batch shape={shoe} pose={pose} /></group>
      <group ref={right} position={[.102,.19,0]}><Batch shape={shoe} pose={pose} /></group>
      <group ref={palm} position={[-.20,.538,-.016]}><Batch shape={arms[0]} pose={pose} /></group>
      <group ref={staff} position={[.195,.537,-.017]}>
        <Batch shape={arms[1]} pose={pose} />
        {priest && <sprite ref={halo} position={staffTip} material={lightHalo} scale={.30} />}
      </group>
      <mesh ref={magic} visible={false} geometry={spellShapes.light} material={spellPaint} />
    </group>
  </group>
}
export function PriestHero(props: HeroProps) { return <Caster {...props} priest /> }
export function MageHero(props: HeroProps) { return <Caster {...props} priest={false} /> }
