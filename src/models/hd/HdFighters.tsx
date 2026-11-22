import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide, Bone, BufferGeometry, CatmullRomCurve3, Euler, Float32BufferAttribute,
  Group, Matrix4, MeshBasicMaterial, Quaternion, Shape, ShapeGeometry, Skeleton,
  SkinnedMesh, SphereGeometry, TubeGeometry, Uint16BufferAttribute, Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BlobShadow } from '../Effects'
import { bake, gem, toon, type Part, type V3 } from '../kit'
import type { MenuPose } from './menuPose'

const tau = Math.PI * 2
const zero: V3 = [0, 0, 0], unit: V3 = [1, 1, 1]
const plum = '#322336', gold = '#ffbf51', gilt = '#ffea9b'
const hide = '#8b4934', hideLight = '#b46945', umber = '#553044'
const iron = '#819bb9', silver = '#c2d9e9', frost = '#f2f9fb'
const cobalt = '#2853b0', sky = '#4891e1', midnight = '#233b79', aqua = '#46bed2'
const leaf = '#80a638', lime = '#b4cc52', forest = '#436d34', moss = '#688d36'
const ink = new MeshBasicMaterial({ color: '#2e243c', side: BackSide })
const orb = new SphereGeometry(1, 12, 8)
const smallOrb = new SphereGeometry(1, 8, 5)
type Point = [number, number]
type Ring = [y: number, rx: number, rz: number, x?: number, z?: number]
type Side = -1 | 1
const sides: Side[] = [-1, 1]
const piece = (g: BufferGeometry, c: string, p: V3 = zero, s: V3 = unit, r?: V3, ink = false): Part =>
  ({ g, c, p, s, r, ink })
const oval = (c: string, p: V3, s: V3, r?: V3, outlined = false) => piece(orb, c, p, s, r, outlined)
const bead = (c: string, p: V3, s: V3, r?: V3) => piece(smallOrb, c, p, s, r)

// Closed rings along a path. Rings run clockwise when viewed along the path.
function skinRings(rows: V3[][], capEnd = true, capStart = true) {
  const positions = rows.flat(2), indices: number[] = []
  const n = rows[0].length
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < n; i++) {
    const a = j*n+i, b = j*n+(i+1)%n
    indices.push(a, a+n, b, b, a+n, b+n)
  }
  for (const top of [false, true]) {
    if (top ? !capEnd : !capStart) continue
    const row = rows[top ? rows.length - 1 : 0]
    const center = new Vector3()
    for (const p of row) center.add(new Vector3(...p))
    positions.push(...center.divideScalar(n).toArray())
    const k = positions.length / 3 - 1, start = top ? (rows.length-1)*n : 0
    for (let i = 0; i < n; i++) {
      const a = start+i, b = start+(i+1)%n
      indices.push(k, top ? b : a, top ? a : b)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}
// Softer square sections give the chin, boot toes and breastplate broad front planes.
function loft(rings: Ring[], power = .82, n = 16, pleat = 0) {
  return skinRings(rings.map(([y, rx, rz, x = 0, z = 0], row) =>
    Array.from({ length: n }, (_, i): V3 => {
      const a = tau*i/n, c = Math.cos(a), s = Math.sin(a)
      const fold = 1 + pleat * Math.cos(6*a) * (1-row/(rings.length-1))
      return [x + rx*Math.sign(c)*Math.abs(c)**power*fold, y, z + rz*Math.sign(s)*Math.abs(s)**power*fold]
    })))
}
const garment = (c: string, rings: Ring[], outline = true, pleat = 0) =>
  piece(loft(rings, .83, pleat ? 30 : 16, pleat), c, zero, unit, undefined, outline)
function cord(c: string, pts: V3[], radius: number, steps = 8) {
  const path = new CatmullRomCurve3(pts.map(p => new Vector3(...p)))
  return piece(new TubeGeometry(path, steps, radius, 5, false), c)
}
// A front-facing cut-paper shape for painted features and insignia.
function decal(c: string, pts: Point[], p: V3, r?: V3) {
  const shape = new Shape()
  shape.moveTo(...pts[0])
  for (const next of pts.slice(1)) shape.lineTo(...next)
  shape.closePath()
  return piece(new ShapeGeometry(shape), c, p, unit, r)
}
// A swept lock, leaf or feather: a broad belly, an off-centre ridge and a fine curled tip.
function quill(c: string, base: V3, bend: V3, tip: V3, width: number, depth: number, facing: V3 = [0,0,1], outlined = false) {
  const path = new CatmullRomCurve3([base,bend,tip].map(p => new Vector3(...p)))
  const front = new Vector3(...facing)
  const rings = [.38,.78,1,.94,.74,.43,.023].map((size, i, all) => {
    const t = i/(all.length-1), center = path.getPoint(t), along = path.getTangent(t)
    const across = new Vector3().crossVectors(along, front).normalize()
    const out = new Vector3().crossVectors(across, along).normalize()
    return Array.from({ length: 8 }, (_, j): V3 => {
      const a = tau*j/8
      return center.clone().addScaledVector(across, width*size*Math.cos(a))
        .addScaledVector(out, depth*size*Math.sin(a)).toArray()
    })
  })
  return piece(skinRings(rings), c, zero, unit, undefined, outlined)
}

// The pivot table doubles as the bind pose. All sculpt coordinates below are joint-local.
const pivots = {
  hips:       [null, 0,.38,0], spine: ['hips',0,.46,0], chest: ['spine',0,.68,0],
  neck: ['chest',0,.84,0], head: ['neck',0,1.062,.008],
  eyeL: ['head',-.092,1.078,.215], eyeR: ['head',.092,1.078,.215],
  crest: ['head',0,1.23,0], cape: ['chest',0,.785,-.105], hem: ['cape',-.07,.55,-.18],
  shoulderL: ['chest',-.197,.774,0], elbowL: ['shoulderL',-.197,.609,0], handL: ['elbowL',-.197,.449,0],
  shoulderR: ['chest',.197,.774,0], elbowR: ['shoulderR',.197,.609,0], handR: ['elbowR',.197,.449,0],
  thighL: ['hips',-.102,.38,0], kneeL: ['thighL',-.102,.204,0], bootL: ['kneeL',-.102,.107,0],
  thighR: ['hips',.102,.38,0], kneeR: ['thighR',.102,.204,0], bootR: ['kneeR',.102,.107,0],
  weapon: ['handR',.197,.449,0],
} as const
type Joint = keyof typeof pivots
type Limb = 'L' | 'R'
const joints = Object.keys(pivots) as Joint[]
type Sculpt = Partial<Record<Joint, Part[]>>
function add(s: Sculpt, joint: Joint, ...parts: Part[]) {
  const batch = s[joint] ??= []
  batch.push(...parts)
}
const buckle = (p: V3, w: number) => [
  oval(gold, p, [w,.030,.012]),
  oval(umber, [p[0],p[1],p[2]+.009], [w*.68,.018,.007]),
  cord(gilt, [[p[0]-.004,p[1],p[2]+.019],[p[0]+w*.76,p[1]+.003,p[2]+.016]], .004, 1),
]

function legs(s: Sculpt, ranger: boolean) {
  for (const side of sides) {
    const k: Limb = side < 0 ? 'L' : 'R'
    add(s,`thigh${k}`, garment(ranger ? '#584437' : '#534050', [
      [-.195,.066,.067],[-.13,.071,.075],[-.045,.073,.079],[.014,.064,.061],
    ]))
    add(s,`knee${k}`, garment(hide, [[-.125,.074,.071],[-.082,.081,.08],[.024,.09,.087],[.040,.081,.077]]),
      garment(ranger ? hideLight : umber, [[.005,.089,.085],[.014,.093,.09],[.042,.089,.087]], false))
    if (ranger) {
      add(s,`knee${k}`, ...buckle([side*.025,.022,.088],.027))
    } else {
      add(s,`knee${k}`, oval(iron,[0,.012,.068],[.076,.073,.029],undefined,true),
        piece(gem,silver,[0,.02,.091],[.13,.13,.035]), bead(gilt,[side*.055,.026,.089],[.007,.007,.005]))
    }
    add(s,`boot${k}`, garment(umber,[[-.107,.083,.125,0,.030],[-.098,.095,.135,0,.031],[-.077,.094,.131,0,.028]]),
      garment(hide,[[-.080,.092,.131,0,.029],[-.057,.097,.13,0,.033],[-.035,.092,.112,0,.025],[.020,.071,.077],[.062,.074,.07]]),
      cord(hideLight,[[-.078,-.045,.089],[-.048,-.034,.122],[0,-.032,.131],[.051,-.035,.12],[.079,-.046,.086]],.004))
    for (let i=0;i<3;i++) add(s,`boot${k}`,cord('#d18a58',
      [[side*(.070+.005*i),-.04-.008*i,.104-i*.012],[side*(.076+.005*i),-.045-.008*i,.098-i*.012]],.0026,1))
  }
}

function clothes(s: Sculpt, ranger: boolean) {
  const coat = ranger ? forest : cobalt, edge = ranger ? lime : gilt
  add(s,'hips', garment(coat,[[-.080,.209,.148,0,.005],[-.051,.209,.146],[.045,.168,.119],[.106,.146,.110]],true,.03),
    garment(edge,[[-.077,.217,.155,0,.005],[-.061,.217,.155,0,.005]],false),
    garment(ranger ? moss : midnight,[[-.056,.216,.154,0,.005],[-.048,.212,.151,0,.005]],false))
  add(s,'spine',garment(coat,[[-.033,.153,.118],[.029,.157,.115],[.163,.187,.135],[.275,.170,.119],[.322,.105,.095]]),
    garment(ranger ? hide : aqua,[[.002,.164,.124],[.016,.170,.127],[.066,.159,.123],[.075,.154,.118]]),
    ...buckle([ranger ? -.033 : .018,.040,.13],.037))
  if (ranger) {
    add(s,'spine',oval(hide, [.146,.012,.099],[.065,.064,.037],[0,.55,-.12],true),
      oval(hideLight,[.148,.035,.122],[.067,.037,.024],[0,.51,-.13]),
      bead(gold,[.154,.019,.146],[.009,.01,.009]))
    add(s,'chest', cord(hide, [[.145,.094,.057],[.104,.056,.12],[.028,-.02,.137],[-.115,-.139,.115]],.023),
      cord(hideLight, [[.138,.096,.073],[.100,.053,.136],[.02,-.029,.152],[-.126,-.137,.124]],.004),
      garment(leaf,[[.046,.179,.118],[.071,.196,.127],[.128,.124,.114],[.177,.093,.087]]),
      quill(lime,[.136,.113,.083],[.041,.055,.141],[-.095,-.003,.132],.035,.014),
      quill(moss,[-.15,.105,.083],[-.069,.045,.141],[.022,-.033,.141],.043,.015),
      quill('#8fb843',[-.073,.117,.12],[-.019,.039,.152],[.057,-.044,.144],.081,.019),
      cord(lime,[[-.092,.081,.133],[-.042,.050,.167],[.008,.028,.172]],.004))
  } else {
    add(s,'hips',quill(aqua,[-.12,.124,.084],[-.135,.040,.13],[-.179,-.099,.127],.040,.015),
      quill('#78dee0',[-.128,.102,.105],[-.152,.048,.134],[-.204,-.015,.105],.026,.012))
    add(s,'chest',garment(iron,[[-.132,.130,.105],[-.095,.158,.137],[.019,.190,.151],[.079,.181,.133],[.118,.123,.10]]),
      garment(silver,[[.027,.190,.152],[.061,.188,.148],[.107,.148,.127]],false),
      garment(midnight,[[.085,.171,.126],[.123,.159,.12],[.16,.108,.085]]),
      garment(sky,[[.104,.163,.125],[.125,.160,.119]],false),
      piece(gem,gilt,[0,.005,.153],[.067,.089,.021]),
      cord('#647f9f',[[-.150,-.035,.106],[-.095,-.057,.141],[0,-.083,.147],[.099,-.056,.14],[.152,-.035,.103]],.004),
      cord(silver,[[-.15,-.027,.106],[-.093,-.050,.143],[0,-.075,.15],[.098,-.049,.142],[.15,-.027,.107]],.005),
      quill(cobalt,[-.13,.127,.083],[-.034,.105,.136],[.105,.091,.124],.036,.019))
    for (const d of sides) add(s,'chest',oval(gold,[d*.138,.086,.109],[.030,.033,.012],[0,d*.39,0]),
      bead(gilt,[d*.138-.006,.094,.122],[.011,.013,.004]))
  }
  add(s,'neck',oval(ranger ? '#dd9667' : '#e2a174',[0,.029,0],[.077,.083,.075]))
}

function arms(s: Sculpt, ranger: boolean) {
  for (const side of sides) {
    const k: Limb = side < 0 ? 'L' : 'R'
    add(s,`shoulder${k}`,garment(ranger ? moss : '#e5c59a',[[-.158,.055,.054],[-.111,.070,.071],[-.023,.085,.081],[.031,.065,.068]]))
    if (!ranger) {
      add(s,`shoulder${k}`,garment(midnight,[[-.075,.095,.098],[-.054,.098,.100],[-.026,.086,.088]]),
        garment(silver,[[-.056,.100,.103],[-.029,.104,.108],[.018,.09,.094],[.05,.060,.066],[.058,.022,.027]]),
        garment(iron,[[-.059,.101,.104],[-.044,.103,.107]],false),
        bead(gilt,[side*.06,-.037,.088],[.009,.009,.006]))
    }
    add(s,`elbow${k}`,oval(ranger ? '#df996a' : '#ebb485',[0,-.051,0],[.055,.09,.056]),
      garment(ranger ? hide : iron,[[-.161,.057,.059],[-.141,.068,.067],[-.068,.064,.063],[-.056,.057,.057]]),
      garment(ranger ? hideLight : silver,[[-.088,.065,.065],[-.066,.066,.064]],false),
      garment(ranger ? umber : midnight,[[-.15,.067,.067],[-.139,.069,.068]],false))
    const glove = ranger ? hideLight : hide
    add(s,`hand${k}`,oval(glove,[0,-.022,.007],[.063,.069,.054],undefined,true))
    for (let i=0;i<3;i++) add(s,`hand${k}`,
      bead(glove,[(i-1)*.034,-.046,.041],[.022,.039,.022],[.14,0,(i-1)*.11]))
    add(s,`hand${k}`,oval(ranger ? '#e29c72' : hideLight,[-side*.052,-.017,.034],[.028,.042,.030],[.17,0,side*.46]))
  }
}

// Project the eye artwork onto the cheek plane. Concentric contours follow its curvature
// even at the outer corners; this keeps the liner attached in a three-quarter view.
function eyePaint(c: string, side: Side, contour: Point[], lift: number) {
  const cx=contour.reduce((sum,p)=>sum+p[0],0)/contour.length
  const cy=contour.reduce((sum,p)=>sum+p[1],0)/contour.length
  const n=contour.length, verts:number[]=[], indices:number[]=[]
  for (const w of [.001,.46,.76,1]) for (const [u,v] of contour) {
    const x=cx+(u-cx)*w,y=cy+(v-cy)*w
    const headX=side*(.092+x), headY=.016+y
    const ry=headY<.020 ? .204-.012*(.020-headY)/.083 : .204-.008*(headY-.020)/.087
    const z=.008+ry*(1-(Math.abs(headX)/.232)**2.94)**.34
    verts.push(side*x,y,z-.215+lift)
  }
  const ccw=contour.reduce((area,[x,y],i)=>area+x*contour[(i+1)%n][1]-y*contour[(i+1)%n][0],0)*side>0
  for(let j=0;j<3;j++) for(let i=0;i<n;i++) {
    const a=j*n+i,b=j*n+(i+1)%n
    if(ccw) indices.push(a,a+n,b+n,a,b+n,b)
    else indices.push(a,b+n,a+n,a,b,b+n)
  }
  const g=new BufferGeometry()
  g.setAttribute('position',new Float32BufferAttribute(verts,3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return piece(g,c)
}
function irisShape(cx:number,cy:number,rx:number,ry:number,top=1):Point[] {
  return Array.from({length:24},(_,i)=>[cx+rx*Math.cos(i*tau/24),cy+ry*Math.min(top,Math.sin(i*tau/24))])
}
function faces(s: Sculpt, ranger: boolean) {
  const skin = ranger ? '#edab78' : '#f5b987'
  add(s,'head',piece(loft([[-.190,.061,.089,0,.018],[-.177,.124,.132,0,.018],
    [-.130,.186,.168,0,.014],[-.063,.224,.192,0,.009],[.020,.233,.204],
    [.107,.224,.196],[.169,.183,.159],[.192,.109,.110]],.68,24),skin,zero,unit,undefined,true))
  for (const side of sides) {
    add(s,'head',oval(skin,[side*.224,-.017,-.005],[.047,.064,.037],[0,0,-side*.36],true),
      oval('#d88562',[side*.245,-.018,.024],[.022,.038,.011],[0,side*.32,-side*.35]))
    const k = side < 0 ? 'eyeL' : 'eyeR'
    const iris = ranger ? '#477369' : '#91502e'
    const lid:Point[]=[[-.058,.011],[-.041,.031],[-.014,.039],[.015,.040],[.044,.037],
      [ranger ? .074 : .061, ranger ? .049 : .030],[.058,.007],[.050,-.019],[.032,-.035],[.004,-.043],[-.024,-.039],[-.046,-.023]]
    const white:Point[]=[[-.054,.007],[-.034,.021],[-.010,.027],[.020,.029],[.050,.026],
      [.052,.008],[.045,-.015],[.027,-.030],[.004,-.038],[-.021,-.034],[-.042,-.019]]
    const look = side*(ranger ? .006 : .009)
    add(s,k,eyePaint(plum,side,lid,.005),
      eyePaint('#fff4db',side,white,.007),
      eyePaint(iris,side,irisShape(look-.001,-.001,.029,.034,.81),.009),
      eyePaint('#38283a',side,irisShape(look,.003,.019,.024,.91),.0105),
      eyePaint('#fff9e3',side,irisShape(look-side*.008,.013,.008,.009),.0125),
      eyePaint(ranger ? '#a5e6c3' : '#e6a654',side,irisShape(look+side*.009,-.021,.005,.0035),.0125))
    const browY = side < 0 ? (ranger ? .092 : .09) : .066
    const brow: Point[] = [[-.064,.004],[-.037,.018],[.036,.024],[.068,.016],[.055,-.002],[-.040,-.010]]
    add(s,'head',decal(ranger ? '#6a372a' : '#673126',brow.map(([x,y]) => [side*x,y]),
      [side*.093,browY,.210],[0,side*.28,side*(ranger ? .12 : .22)]))
    for (let i=0;i<3;i++) add(s,'head',bead(ranger ? '#b96b50' : '#dc966d',
      [side*(.130+i*.017),-.040+Math.sin(i*2)*.009,.196-i*.007],[.0045,.0038,.003]))
  }
  add(s,'head',oval(skin,[0,-.036,.200],[.035,.026,.034],[-.10,0,0]),
    bead('#fbd0a2',[-.005,-.034,.227],[.012,.007,.005]))
  const grin: Point[] = ranger
    ? [[-.057,.005],[-.017,-.003],[.024,.002],[.064,.023],[.047,-.004],[.013,-.022],[-.017,-.020],[-.040,-.013]]
    : [[-.061,.003],[-.028,-.001],[.014,.001],[.051,.012],[.066,.025],[.057,.002],[.026,-.013],[-.010,-.015],[-.041,-.007]]
  add(s,'head',decal('#773d3a',grin,[.008,-.100,.192],[-.30,0,0]),
    decal('#fff1d5',[[-.026,-.003],[.019,.001],[.052,.014],[.040,.001],[.006,-.007]],
      [.008,-.099,.194],[-.30,0,0]))
}

function swordsmanHair(s: Sculpt) {
  add(s,'head',piece(loft([[.072,.210,.179,0,-.009],[.104,.245,.202,0,-.009],[.179,.248,.204,-.006,-.013],
    [.232,.201,.173,-.020,-.018],[.265,.129,.123,-.035,-.019],[.279,.039,.047,-.048,-.009]]),
    '#863e2d',zero,unit,undefined,true))
  // The bangs follow a part above the right eyebrow and sweep past the left temple.
  const curls: [string,V3,V3,V3,number,number][] = [
    ['#9f4930',[.088,.206,.087],[.153,.139,.153],[.220,.061,.118],.074,.044],
    ['#783929',[.151,.165,.091],[.213,.077,.107],[.217,-.032,.093],.057,.043],
    ['#9e4a30',[-.161,.183,.070],[-.219,.091,.095],[-.236,-.035,.079],.061,.047],
    ['#a74d31',[.095,.229,.068],[.018,.158,.182],[-.102,.067,.202],.075,.042],
    ['#bf6440',[.062,.245,.068],[-.052,.200,.175],[-.211,.101,.147],.079,.047],
    ['#a64f35',[-.017,.236,.040],[-.159,.196,.117],[-.306,.171,.078],.074,.045],
    ['#aa4d31',[.069,.246,.041],[.168,.218,.080],[.268,.176,.014],.067,.046],
    ['#c66a43',[.067,.229,.113],[.108,.162,.193],[.072,.089,.218],.051,.033],
    ['#8a402c',[-.099,.171,-.090],[-.19,.121,-.12],[-.269,.060,-.083],.068,.048],
    ['#8a402c',[.116,.194,-.111],[.199,.124,-.096],[.267,.081,-.051],.065,.045],
    ['#75382e',[0,.139,-.166],[-.022,.046,-.193],[-.066,-.070,-.177],.129,.046],
  ]
  for (const [c,a,b,t,w,d] of curls) add(s,'head',quill(c,a,b,t,w,d,[0,.35,1],true))
  add(s,'crest',
    quill('#a65032',[.077,.051,-.024],[-.021,.136,-.005],[-.19,.178,-.021],.078,.046,[0,.75,.7],true),
    quill('#be5f39',[.076,.056,.032],[-.048,.137,.060],[-.215,.121,.050],.066,.046,[0,1,.7],true),
    quill('#d07747',[.056,.053,-.034],[.102,.136,-.040],[.078,.203,-.012],.044,.034,[0,.6,1],true),
    quill('#a45134',[-.008,.040,-.071],[-.114,.075,-.112],[-.249,.107,-.116],.078,.041,[0,1,0],true))
  add(s,'head',quill('#d17a49',[.056,.241,.130],[-.056,.204,.207],[-.181,.132,.176],.012,.005),
    quill('#b36642',[.101,.208,.147],[.145,.165,.166],[.183,.123,.145],.010,.006),
    quill('#773929',[-.07,.217,.103],[-.157,.183,.139],[-.258,.158,.104],.016,.008),
    quill('#a45234',[.157,.218,.048],[.233,.165,.051],[.282,.145,.047],.036,.023,[0,.5,1],true),
    quill('#8d402b',[.192,.130,.020],[.235,.078,.040],[.260,.049,.053],.032,.024,[1,.2,.6],true))
}

function hood(s: Sculpt) {
  // Nested openings form the outer crown, turned-back lip, and shaded inner lining.
  // A bias cut lifts one side of the brim and lets the crown trail behind the head.
  const n = 36
  function opening(rx: number, ry: number, z: number, cy: number, brim: number, cx = 0): V3[] {
    return Array.from({length:n},(_,i) => {
      const a=tau*i/n, x=Math.sin(a), y=Math.cos(a)
      return [cx+rx*x,cy+ry*y+.023*x-brim*.026*Math.max(0,y)**9,
        z+brim*(.077*y-.038*x*x)]
    })
  }
  const rows = [
    opening(.023,.028,-.279,.186,0,-.082),opening(.132,.124,-.235,.120,0,-.060),
    opening(.243,.207,-.133,.055,0,-.032),opening(.285,.250,-.016,.026,0,-.012),
    opening(.264,.232,.086,.019,.20),opening(.249,.213,.134,.016,.69),
    opening(.227,.193,.156,.012,1),opening(.217,.183,.146,.011,1),opening(.211,.178,.118,.01,.83),
  ]
  add(s,'head',piece(skinRings(rows.slice(0,6),false),leaf,zero,unit,undefined,true),
    piece(skinRings(rows.slice(5,8),false,false),lime),
    piece(skinRings(rows.slice(7),false,false),'#4e7132'))
  // Draw cord and built-in peak badge, with loose red-brown locks in the opening.
  add(s,'head',quill('#ac5836',[.113,.173,.105],[.035,.140,.177],[-.084,.084,.201],.052,.025),
    quill('#92442e',[-.013,.158,.112],[-.125,.106,.155],[-.193,.035,.131],.052,.029),
    quill('#a24d31',[.106,.165,.114],[.168,.104,.137],[.200,.006,.109],.051,.030),
    piece(gem,gold,[.015,.191,.221],[.071,.073,.032],[0,0,-.12]),
    piece(gem,gilt,[.010,.195,.232],[.032,.035,.013]),
    quill(forest,[-.045,.197,-.139],[-.135,.195,-.215],[-.224,.150,-.263],.070,.050,[0,1,0],true))
  for (const side of sides) {
    add(s,'head',quill(side < 0 ? moss : leaf,[side*.189,.014,.085],[side*.229,-.081,.068],[side*.194,-.172,.098],.042,.030),
      cord('#a8c551',[[side*.246,-.012,.066],[side*.245,-.080,.075],[side*.202,-.163,.091]],.006),
      cord('#73912e',[[side*.229,.154,.022],[side*.199,.174,-.071],[side*.137,.172,-.168],[-.073,.186,-.264]],.004),
      quill(moss,[side*.237,.077,-.087],[side*.270,-.019,-.061],[side*.225,-.133,.018],.034,.021,[side,0,.2]),
      quill('#95b542',[side*.215,.106,-.086],[side*.263,.025,-.032],[side*.242,-.058,-.012],.018,.010,[side,0,.2]))
  }
  plume(s,'#f4db9a',[.16,-.018,-.065],[.229,.067,-.075],[.303,.179,-.113],.039)
  plume(s,'#45c5cd',[.144,-.023,-.036],[.210,.063,-.032],[.233,.190,-.061],.046)
  add(s,'crest',piece(gem,gold,[.164,-.012,-.021],[.050,.069,.052]))
}

function plume(s: Sculpt,c: string,a: V3,b: V3,t: V3,w: number) {
  add(s,'crest',quill(c,a,b,t,w,.013,[0,0,1],true),
    cord('#fff1bf', [a,[b[0],b[1],b[2]+.014],[t[0]-.006,t[1]-.012,t[2]+.003]],.0035))
}

function cape(s: Sculpt, ranger: boolean) {
  // Continuous pleats across the two sections; the hem is weighted to both pivots below.
  const rows = [0,.10,.31,.54,.75,.93,.966,1], n=25
  const colors = ranger ? [forest,moss,'#aac056'] : [midnight,cobalt,'#67a2ef']
  const pos: number[]=[], idx:number[]=[]
  for (const t of rows) for (const back of [0,1]) for (let i=0;i<n;i++) {
    const u=i/(n-1), w=ranger ? .74 : 1
    const fold = Math.cos(u*tau*3.3+.5)*(.013+t*.02)
    const x=(u-.5)*(.33+.45*t*w)+(ranger ? -.085 : .188)*t*t
    const y=.014-.53*t*w-.025*Math.sin(u*Math.PI)+t*t*(.039*Math.cos(tau*u*1.7)+.115*(u-.5))
    const z=.063*(2*u-1)**2-.071-.15*t+fold+back*.012
    pos.push(x,y,z)
  }
  for (let row=0;row<rows.length-1;row++) for (let i=0;i<n-1;i++) {
    const a=row*2*n+i,b=a+2*n
    idx.push(a,a+1,b,b,a+1,b+1,a+n,b+n,a+1+n,b+n,b+1+n,a+1+n)
  }
  const edges: number[][] = [Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>(rows.length-1)*2*n+n-1-i),
    rows.map((_,i)=>2*n*i+n-1),rows.map((_,i)=>(rows.length-1-i)*2*n)]
  for (const edge of edges) for (let i=1;i<edge.length;i++) {
    const a=edge[i-1],b=edge[i]
    idx.push(a,a+n,b,b,a+n,b+n)
  }
  const g=new BufferGeometry()
  g.setAttribute('position',new Float32BufferAttribute(pos,3))
  g.setIndex(idx)
  g.computeVertexNormals()
  add(s,'cape',piece(g,colors[1],zero,unit,undefined,true))
  const hemLine=(t: number): V3[] => Array.from({length:n},(_,i) => {
    const index=(t*2*n+n+i)*3
    return [pos[index],pos[index+1],pos[index+2]+.005]
  })
  add(s,'cape',cord(colors[2],hemLine(6),.007,30),cord(colors[0],hemLine(5),.010,30))
}

function sword(s: Sculpt) {
  // Four forged planes, a widened ricasso and a long, interrupted blue fuller.
  const sections = [[-.586,.002,.002],[-.475,.043,.014],[-.224,.052,.018],[-.159,.063,.022],[-.105,.039,.015]]
  for (let face=0;face<4;face++) {
    const vertices:number[]=[], indices:number[]=[]
    for (const [y,w,d] of sections) {
      const ring: V3[] = [[w,y,0],[0,y,d],[-w,y,0],[0,y,-d]]
      vertices.push(...ring[face],...ring[(face+1)%4])
    }
    for (let i=0;i<sections.length-1;i++) {
      const a=i*2
      indices.push(a,a+2,a+1,a+1,a+2,a+3)
    }
    const g=new BufferGeometry()
    g.setAttribute('position',new Float32BufferAttribute(vertices,3))
    g.setIndex(indices)
    g.computeVertexNormals()
    add(s,'weapon',piece(g,[frost,'#9dbade',silver,iron][face]))
  }
  add(s,'weapon',garment(umber,[[-.105,.025,.024],[-.066,.028,.027],[.045,.024,.023],[.064,.030,.027]]),
    piece(gem,gold,[0,.074,0],[.079,.084,.065]),
    piece(gem,aqua,[0,.077,.027],[.037,.039,.016]),
    oval(gold,[0,-.102,0],[.101,.025,.036],undefined,true),
    piece(gem,gilt,[0,-.106,.017],[.077,.064,.047]),
    piece(gem,'#338fb3',[0,-.106,.038],[.040,.042,.015]),
    decal('#7c98bd',[[0,0],[.006,-.021],[.003,-.158],[0,-.183]], [0,-.144,.023]))
  for (const side of sides) {
    add(s,'weapon',quill(gold,[side*.031,-.107,0],[side*.088,-.100,.002],[side*.125,-.066,0],.023,.024,[0,0,1],true))
  }
  for (let i=0;i<5;i++) add(s,'weapon',cord(hideLight,[[-.023,-.079+.025*i,.007],[0,-.071+.025*i,.028],[.025,-.067+.025*i,0]],.004))
}

function crossbow(s: Sculpt) {
  const p='weapon'
  // Local +Z is the bolt axis. Curved walnut limbs, ferrules and string form the crossbow silhouette.
  add(s,p,piece(loft([[-.181,.036,.030],[-.153,.043,.046],[-.064,.031,.032],
      [.027,.041,.037],[.172,.039,.036],[.224,.043,.033]],.60,12),hide,[0,.036,0],unit,[Math.PI/2,0,0],true),
    oval(hideLight,[0,.048,.094],[.049,.038,.135],undefined,true),
    oval('#425775',[0,.071,.108],[.035,.023,.137]),
    oval(gold,[0,.062,.200],[.061,.037,.036],undefined,true),
    oval(gold,[0,.051,-.106],[.044,.031,.015]),
    cord('#ffe4a1',[[-.187,.064,.079],[0,.069,-.067],[.187,.064,.079]],.005,2),
    cord('#dbaf7c',[[0,.099,-.106],[0,.099,.268]],.008,1),
    piece(gem,silver,[0,.10,.278],[.059,.037,.092]),
    quill('#5ac2c9',[0,.097,-.037],[.014,.109,-.068],[.019,.124,-.123],.011,.009,[0,1,0]))
  for (const d of sides) {
    add(s,p,quill('#c98344',[d*.017,.062,.204],[d*.132,.065,.186],[d*.191,.066,.073],.024,.021,[0,1,0],true),
      cord(gilt,[[d*.047,.082,.203],[d*.119,.085,.178],[d*.158,.081,.138]],.005),
      oval(gold,[d*.184,.066,.088],[.017,.020,.024],[0,d*.39,0]),
      bead('#a5d757',[d*.188,.065,.074],[.014,.016,.015]),
      bead(gilt,[d*.04,.060,-.013],[.008,.009,.009]))
  }
  // The quiver leans clear of the opposite shoulder and stays readable from the front.
  add(s,'chest',quill(hide,[.045,-.225,-.155],[.156,-.015,-.183],[.258,.123,-.166],.072,.064,[0,0,-1],true),
    oval(umber,[.227,.098,-.175],[.073,.054,.063],[0,0,-.55]),
    oval(gold,[.231,.112,-.175],[.072,.024,.065],[0,0,-.55]))
  for (let i=0;i<3;i++) {
    const x=.193+i*.041, y=.166+(i%2)*.052, z=-.206+i*.039
    add(s,'chest', cord('#cc9769',[[x-.065,.044,z],[x+.048,y+.051,z-.008]],.006,1),
      quill(i===1?'#f0d798':'#85c7c5',[x+.01,y-.026,z],[x+.04,y+.022,z],[x+.048,y+.064,z-.008],.015,.008))
  }
}

// Rigid-weighted geometry lets all the paint share one draw, including the eyes and weapon.
// Only the cape needs a blended seam. Its trim and its ink shell use the same weights.
function stitch(s: Sculpt, ranger: boolean) {
  const paint: BufferGeometry[] = [], outlines: BufferGeometry[] = []
  for (const joint of joints) {
    const parts=s[joint]
    if (!parts) continue
    const batch=bake(parts,.0034)
    const pivot=pivots[joint]
    for (const geo of [batch.color,batch.hull]) {
      if (!geo) continue
      geo.translate(pivot[1],pivot[2],pivot[3])
      const pos=geo.getAttribute('position'), ids:number[]=[], weights:number[]=[]
      const rgb=geo.getAttribute('color'), normals=geo.getAttribute('normal')
      const id=joints.indexOf(joint), hem=joints.indexOf('hem')
      for (let i=0;i<pos.count;i++) {
        const w=joint==='cape' ? smooth((.64-pos.getY(i))/(ranger ? .20 : .28)) : 0
        ids.push(id,hem,0,0)
        weights.push(1-w,w,0,0)
        // Painted bounce and occlusion stay legible under the fairly even portrait lights.
        if (rgb) {
          const light=.84+.11*normals.getY(i)-.065*normals.getX(i)+.06*normals.getZ(i)
          rgb.setXYZ(i,rgb.getX(i)*light*1.04,rgb.getY(i)*light,rgb.getZ(i)*(.19+.81*light))
        }
      }
      geo.setAttribute('skinIndex',new Uint16BufferAttribute(ids,4))
      geo.setAttribute('skinWeight',new Float32BufferAttribute(weights,4))
      geo.deleteAttribute('artMask')
      const dest=geo===batch.color ? paint : outlines
      dest.push(geo)
    }
  }
  return { color: mergeGeometries(paint)!, hull: mergeGeometries(outlines)! }
}
function sculpt(ranger: boolean) {
  const s: Sculpt={}
  legs(s,ranger)
  clothes(s,ranger)
  arms(s,ranger)
  faces(s,ranger)
  cape(s,ranger)
  if (ranger) { hood(s); crossbow(s) }
  else { swordsmanHair(s); sword(s) }
  return stitch(s,ranger)
}
const models: Partial<Record<'sword'|'crossbow',ReturnType<typeof stitch>>>={}
function rig(ranger: boolean) {
  const key=ranger ? 'crossbow' : 'sword'
  const model=models[key] ??= sculpt(ranger)
  const group=new Group()
  const bones={} as Record<Joint,Bone>
  for (const key of joints) {
    const [parent,x,y,z]=pivots[key]
    const bone=new Bone()
    bones[key]=bone
    bone.name=key
    // Use the same weapon geometry origin with either grip in the bind pose.
    const parentKey=key==='weapon' && ranger ? 'handL' : parent
    const at=parentKey ? pivots[parentKey] : [null,0,0,0] as const
    bone.position.set(x-at[1],y-at[2],z-at[3])
    const parentBone=parentKey ? bones[parentKey] : group
    parentBone.add(bone)
  }
  group.updateMatrixWorld(true)
  const skeleton=new Skeleton(joints.map(k=>bones[k]))
  for (const [geometry,material] of [[model.color,toon],[model.hull,ink]] as const) {
    const mesh=new SkinnedMesh(geometry,material)
    mesh.bind(skeleton,new Matrix4())
    mesh.frustumCulled=false
    group.add(mesh)
  }
  if(ranger) bones.weapon.position.x=0
  function limb(k:Limb) {
    return {upper:bones[`shoulder${k}`],lower:bones[`elbow${k}`],hand:bones[`hand${k}`],
      leg:bones[`thigh${k}`],knee:bones[`knee${k}`],boot:bones[`boot${k}`]}
  }
  return {group,bones,skeleton,L:limb('L'),R:limb('R'),
    target:new Vector3(), axis:new Vector3(), elbow:new Vector3(), fore:new Vector3(),
    modelRotation:new Quaternion(), parentRotation:new Quaternion(), wristRotation:new Quaternion(), euler:new Euler()}
}
type Rig=ReturnType<typeof rig>
const down=new Vector3(0,-1,0)
function smooth(x: number) { const u=Math.min(1,Math.max(0,x)); return u*u*(3-2*u) }
function beat(t: number, a: number, b: number, c: number, d: number) {
  return smooth((t-a)/(b-a))*(1-smooth((t-c)/(d-c)))
}

// Two-link arms plant the sword and let the other palm actually reach the fringe.
// Targets and wrist orientations are in the fighter's own coordinates, including when
// the caller rotates or scales the whole figure for a party portrait.
function reach(r: Rig, k: Limb, x:number,y:number,z:number, rx:number,ry:number,rz:number) {
  const {upper,lower,hand}=r[k]
  const parent=upper.parent!
  r.target.set(x,y,z)
  r.group.localToWorld(r.target)
  parent.worldToLocal(r.target)
  r.target.sub(upper.position)
  const length=Math.max(.012,Math.min(.3248,r.target.length()))
  r.axis.copy(r.target).normalize()
  r.elbow.set(k==='L' ? -.86 : .86,-.8,-.58)
  r.elbow.addScaledVector(r.axis,-r.elbow.dot(r.axis)).normalize()
  const along=(.165**2-.160**2+length*length)/(2*length)
  r.elbow.multiplyScalar(Math.sqrt(Math.max(0,.165**2-along*along))).addScaledVector(r.axis,along)
  r.fore.copy(r.axis).multiplyScalar(length).sub(r.elbow).normalize()
  upper.quaternion.setFromUnitVectors(down,r.elbow.normalize())
  lower.quaternion.setFromUnitVectors(down,r.fore).premultiply(r.parentRotation.copy(upper.quaternion).invert())
  lower.getWorldQuaternion(r.parentRotation)
  r.wristRotation.setFromEuler(r.euler.set(rx,ry,rz,'YXZ')).premultiply(r.modelRotation)
  hand.quaternion.copy(r.parentRotation.invert()).multiply(r.wristRotation)
}
function animate(r: Rig, pose: MenuPose, ranger: boolean) {
  const b=r.bones
  const t=Math.max(0,pose.t)
  const idle=pose.anim==='idle' ? t%8 : 0
  const cheer=pose.anim==='cheer' ? Math.min(t,1.6) : 0
  const sway=Math.sin(idle*tau/4), breath=Math.sin(idle*tau/2), lag=Math.sin(idle*tau/4-.65)
  const fidget=beat(idle,3.75,4.33,4.75,5.40)
  const gather=beat(cheer,0,.15,.20,.43), salute=beat(cheer,.16,.52,.92,1.56)
  const follow=beat(cheer,.25,.67,1.02,1.6)
  const hop=ranger && cheer>.20 && cheer<.78 ? Math.sin(Math.PI*smooth((cheer-.20)/.58))**2*.094 : 0
  b.hips.position.set((ranger ? -.019 : -.016)+.009*sway,.38+hop,0)
  b.hips.rotation.set(0,ranger ? -.13 : .095,-.063+.018*sway)
  b.spine.rotation.set(.035+gather*.16-salute*.07,-.09+.033*sway+(ranger ? -.22 : .24)*salute,.097-.021*sway)
  b.chest.position.y=.22+.008*breath-.015*gather
  b.chest.rotation.set(-.025-.015*breath+.068*fidget,-.085+.036*sway+(ranger ? -.21 : -.10)*fidget,-.032)
  b.neck.rotation.set(-.025, .13+.04*sway, ranger ? -.047 : .025)
  b.neck.position.y=.140-(ranger ? .020 : .042)*fidget
  const shrug=ranger ? 0 : fidget
  b.shoulderL.position.set(-.197,.094+.063*shrug,.058*shrug)
  b.head.rotation.set(-.037+.014*breath+.12*fidget-.095*salute,
    .14+.045*sway+(ranger ? -.34 : .16)*fidget+(ranger ? -.13 : .08)*salute,
    (ranger ? -.078 : .064)+.02*sway+(ranger ? -.14 : .12)*fidget-.10*salute)
  b.crest.rotation.set(.027*lag-.12*follow,0,.035*lag+(ranger ? -.18 : .14)*follow-.11*fidget)
  b.cape.rotation.set(.07+.044*lag+.53*follow, .045*sway, -.045-.18*follow)
  b.hem.rotation.set(.035+.056*Math.sin(idle*tau/4-1.1)+.24*follow,.13*lag,-.075*sway-.24*follow)
  const blink=beat(idle,2.03,2.096,2.12,2.24)+beat(idle,6.27,6.34,6.36,6.49)
  const wink=ranger ? beat(cheer,.49,.58,.92,1.08) : 0
  b.eyeL.scale.y=1-.94*Math.max(blink,wink)
  b.eyeR.scale.y=1-.94*blink
  r.group.getWorldQuaternion(r.modelRotation)
  for (let side=-1;side<=1;side+=2) {
    const {leg,knee,boot}=side===-1 ? r.L : r.R
    const lifted=side===1 && ranger ? salute : 0
    leg.rotation.set(side*(ranger ? .24 : .18)-lifted*.43,-side*.12,side*(.19+.018*sway))
    knee.rotation.x=.13+lifted*.76
    knee.getWorldQuaternion(r.parentRotation)
    r.wristRotation.setFromEuler(r.euler.set(.26*lifted,-side*.19,side*.1*lifted)).premultiply(r.modelRotation)
    boot.quaternion.copy(r.parentRotation.invert()).multiply(r.wristRotation)
    // Solve from the bind position each frame, including seeking directly to a clip endpoint.
    boot.position.set(0,-.097,0)
    boot.updateWorldMatrix(true,false)
    r.target.setFromMatrixPosition(boot.matrixWorld)
    r.group.worldToLocal(r.target)
    r.target.y=.107+hop+lifted*.072
    r.group.localToWorld(r.target)
    boot.position.copy(knee.worldToLocal(r.target))
  }
  if (ranger) {
    const aim=Math.max(fidget*.82,salute)
    reach(r,'L',-.248-.032*aim,.596+.251*aim+hop+.007*breath,.146+.082*aim,
      .29-.39*aim,-.70+.26*aim,-.25+.30*aim)
    reach(r,'R',.218-.260*aim,.482+.306*aim+hop+.009*sway,.046+.124*aim,
      -.18-aim*.47,-.31-.77*aim,-.49-.36*aim)
  } else {
    reach(r,'R',.336+.021*salute,.579+.286*salute-.012*gather,.112+.052*salute,
      .156-3.00*salute+.12*gather,-.13+.32*salute,.058+.13*salute)
    const brush=smooth((idle-4.23)/.51)
    reach(r,'L',-.188+(.075-.136*brush)*fidget-.093*salute,.505+.561*fidget+.095*salute,
      .109+(.177-.080*brush)*fidget+.016*salute,-.24-2.63*fidget-.55*salute,-.25+.40*fidget,.30-.41*fidget)
  }
}

function Fighter({pose,ranger}: {pose: MenuPose; ranger:boolean}) {
  const model=useMemo(()=>rig(ranger),[ranger])
  useEffect(()=>()=>model.skeleton.dispose(),[model])
  useFrame(()=>animate(model,pose,ranger))
  return <group scale={.90}>
    <BlobShadow radius={.37}/>
    <primitive object={model.group} dispose={null}/>
  </group>
}
export function HdSwordsman({pose}: {pose:MenuPose}) { return <Fighter pose={pose} ranger={false}/> }
export function HdArcher({pose}: {pose:MenuPose}) { return <Fighter pose={pose} ranger/> }
