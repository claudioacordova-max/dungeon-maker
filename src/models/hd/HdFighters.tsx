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
const hide = '#864633', hideLight = '#bd7048', umber = '#513048'
const iron = '#819bb9', silver = '#c2d9e9', frost = '#f2f9fb'
const cobalt = '#305bbd', sky = '#5aadea', midnight = '#29356a', aqua = '#48c8cb'
const leaf = '#799c37', lime = '#bbcf62', forest = '#366441', moss = '#577e39'
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
  lidL: ['head',-.092,1.078,.215], lidR: ['head',.092,1.078,.215],
  browL: ['head',-.092,1.14,.211], browR: ['head',.092,1.14,.211],
  fringe: ['head',.066,1.276,.113],
  crest: ['head',0,1.23,0], cape: ['chest',0,.785,-.105], hem: ['cape',-.07,.55,-.18],
  shoulderL: ['chest',-.197,.774,0], elbowL: ['shoulderL',-.197,.609,0], handL: ['elbowL',-.197,.449,0],
  shoulderR: ['chest',.197,.774,0], elbowR: ['shoulderR',.197,.609,0], handR: ['elbowR',.197,.449,0],
  thighL: ['hips',-.102,.38,0], kneeL: ['thighL',-.102,.239,0], bootL: ['kneeL',-.102,.107,0],
  thighR: ['hips',.102,.38,0], kneeR: ['thighR',.102,.239,0], bootR: ['kneeR',.102,.107,0],
  weapon: ['handR',.197,.449,0],
  bolt: ['handR',.197,.421,.061],
} as const
type Joint = keyof typeof pivots
type Limb = 'L' | 'R'
const joints = Object.keys(pivots) as Joint[]
type Sculpt = Partial<Record<Joint, Part[]>>
function add(s: Sculpt, joint: Joint, ...parts: Part[]) {
  const batch = s[joint] ??= []
  batch.push(...parts)
}
// Locks are sculpted against the head surface, then hinged at the hair part.
function addFringe(s: Sculpt, ...locks: Part[]) {
  const head=pivots.head, hinge=pivots.fringe
  for (const lock of locks) {
    lock.p=[head[1]-hinge[1],head[2]-hinge[2],head[3]-hinge[3]]
    add(s,'fringe',lock)
  }
}
const buckle = (p: V3, w: number) => [
  oval(gold, p, [w,.030,.012]),
  oval(umber, [p[0],p[1],p[2]+.009], [w*.68,.018,.007]),
  cord(gilt, [[p[0]-.004,p[1],p[2]+.019],[p[0]+w*.76,p[1]+.003,p[2]+.016]], .004, 1),
]

function legs(s: Sculpt, ranger: boolean) {
  for (const side of sides) {
    const k: Limb = side < 0 ? 'L' : 'R'
    add(s,`thigh${k}`, garment(ranger ? '#64423c' : '#534050', [
      [-.154,.044,.046],[-.132,.061,.063],[-.095,.068,.072],[-.045,.073,.079],[.014,.064,.061],
    ]))
    add(s,`knee${k}`, garment(hide, [[-.151,.064,.063],[-.100,.074,.074],[-.042,.083,.079],[-.012,.085,.081],[.008,.071,.067]]),
      garment(ranger ? hideLight : umber, [[-.043,.083,.082],[-.031,.090,.086],[-.005,.087,.083],[.005,.072,.069]], false))
    if (ranger) {
      add(s,`knee${k}`, ...buckle([side*.025,-.022,.083],.026))
    } else {
      add(s,`knee${k}`, oval(iron,[0,.012,.068],[.076,.073,.029],undefined,true),
        piece(gem,silver,[0,.02,.091],[.13,.13,.035]), bead(gilt,[side*.055,.026,.089],[.007,.007,.005]))
    }
    add(s,`boot${k}`, garment(umber,[[-.107,.083,.125,0,.030],[-.098,.095,.135,0,.031],[-.077,.094,.131,0,.028]]),
      garment(hide,[[-.080,.092,.131,0,.029],[-.057,.097,.13,0,.033],[-.035,.092,.112,0,.025],[.006,.073,.078],[.040,.067,.063],[.056,.051,.050]]),
      cord(hideLight,[[-.081,-.051,.112],[-.047,-.042,.145],[0,-.041,.151],[.049,-.044,.145],[.082,-.055,.112]],.005))
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
      bead(gold,[.160,.018,.147],[.012,.011,.007]),
      quill('#cf9165',[-.107,.069,.103],[-.102,.045,.122],[-.107,.011,.110],.012,.007),
      quill('#d4a075',[-.078,.069,.116],[-.075,.045,.136],[-.083,.011,.116],.010,.006))
    add(s,'chest', cord(hide, [[.145,.094,.057],[.104,.056,.12],[.028,-.02,.137],[-.115,-.139,.115]],.023),
      cord(hideLight, [[.138,.096,.073],[.100,.053,.136],[.02,-.029,.152],[-.126,-.137,.124]],.004),
      garment(leaf,[[.046,.179,.118],[.071,.196,.127],[.128,.124,.114],[.177,.093,.087]]),
      quill(lime,[.136,.113,.083],[.041,.055,.141],[-.095,-.003,.132],.035,.014),
      quill(moss,[-.15,.105,.083],[-.069,.045,.141],[.022,-.033,.141],.043,.015),
      quill('#9dbc4e',[-.073,.117,.12],[-.019,.039,.152],[.057,-.044,.144],.081,.019),
      quill(gilt,[-.068,.101,.145],[-.025,.040,.174],[.043,-.029,.159],.006,.004),
      piece(gem,gold,[-.056,.088,.156],[.060,.069,.033]),
      piece(gem,'#338e87',[-.056,.090,.169],[.038,.044,.016]))
  } else {
    add(s,'hips',quill('#356fc0',[-.027,.067,.125],[-.054,-.044,.154],[-.079,-.112,.132],.061,.010),
      quill(sky,[-.053,.050,.137],[-.081,-.050,.154],[-.079,-.103,.137],.009,.006),
      quill(aqua,[-.12,.124,.084],[-.135,.040,.13],[-.179,-.099,.127],.040,.015),
      quill('#78dee0',[-.128,.102,.105],[-.152,.048,.134],[-.204,-.015,.105],.026,.012))
    add(s,'spine',quill('#71d7da',[.137,.054,.081],[.070,.047,.128],[-.119,.014,.115],.014,.005),
      quill('#329cae',[-.130,.058,.082],[-.074,.039,.130],[.002,.022,.133],.009,.005),
      piece(gem,gilt,[-.127,.040,.095],[.047,.043,.023],[0,-.6,.16]))
    add(s,'chest',garment(iron,[[-.132,.130,.105],[-.095,.158,.137],[.019,.190,.151],[.079,.181,.133],[.118,.123,.10]]),
      garment(silver,[[.027,.190,.152],[.061,.188,.148],[.107,.148,.127]],false),
      garment(midnight,[[.085,.171,.126],[.123,.159,.12],[.16,.108,.085]]),
      garment(sky,[[.104,.163,.125],[.125,.160,.119]],false),
      piece(gem,midnight,[0,.012,.153],[.108,.118,.028]),
      decal(gilt,[[0,.059],[.015,.013],[.043,.002],[.013,-.013],[0,-.051],[-.011,-.012],[-.043,0],[-.013,.015]],
        [0,.012,.170]),
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
      if(k==='R') add(s,'shoulderR',
        quill('#8aa6bf',[.037,.046,.047],[.049,.005,.093],[.051,-.035,.098],.018,.006),
        quill(frost,[.035,.047,.049],[.039,.005,.099],[.045,-.028,.103],.008,.004))
    }
    add(s,`elbow${k}`,oval(ranger ? '#df996a' : '#ebb485',[0,-.051,0],[.055,.09,.056]),
      garment(ranger ? hide : iron,[[-.161,.057,.059],[-.141,.068,.067],[-.068,.064,.063],[-.056,.057,.057]]),
      garment(ranger ? hideLight : silver,[[-.088,.065,.065],[-.066,.066,.064]],false),
      garment(ranger ? umber : midnight,[[-.15,.067,.067],[-.139,.069,.068]],false))
    const glove = ranger ? hideLight : hide
    const loose = ranger ? k==='R' : k==='L'
    add(s,`hand${k}`,oval(glove,[0,-.020,.007],[.061,loose ? .047 : .057,loose ? .035 : .048],undefined,true))
    for (let i=0;i<4;i++) {
      const x=side*(i-1.5)*.025, y=loose ? -.060+.005*i : -.046
      add(s,`hand${k}`,oval(ranger ? '#efa975' : '#9f5339',[x,y,.038],
        [.016,loose ? .046-.003*i : .026,.020],[loose ? -.18 : .25,0,side*(i-1.5)*.20]))
    }
    if(!ranger && loose) add(s,'handL',oval(hideLight,[0,-.039,-.019],[.046,.029,.009],[.16,0,0]))
    add(s,`hand${k}`,oval(ranger ? '#efa975' : hideLight,[-side*.046,-.018,.042],
      [.024,.041,.023],[.28,0,-side*.50]))
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

// The top lip, tooth and tongue follow the slope from the cheek down to the chin.
// Each column is [x, lower edge, upper edge] in head space.
function smilePaint(c: string, columns: [number,number,number][], lift: number) {
  const xyz: number[]=[], indices: number[]=[]
  for (const [x,low,high] of columns) for (const y of [low,high]) {
    const u=(y+.130)/.067
    const rx=.186+.038*u, rz=.168+.024*u, cheekZ=.014-.005*u
    xyz.push(x,y,cheekZ+rz*(1-(Math.abs(x)/rx)**(2/.68))**(.68/2)+lift)
  }
  for (let a=0;a<columns.length*2-2;a+=2) indices.push(a,a+2,a+1,a+1,a+2,a+3)
  const g=new BufferGeometry()
  g.setAttribute('position',new Float32BufferAttribute(xyz,3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return piece(g,c)
}
function faces(s: Sculpt, ranger: boolean) {
  const skin = ranger ? '#eba777' : '#f5b886'
  const cheek=loft([[-.190,.061,.089,0,.018],[-.177,.124,.132,0,.018],
    [-.130,.186,.168,0,.014],[-.063,.224,.192,0,.009],[.020,.233,.204],
    [.107,.224,.196],[.169,.183,.159],[.192,.109,.110]],.68,32)
  const vertices=cheek.getAttribute('position'), blush:number[]=[]
  for(let i=0;i<vertices.count;i++) {
    const x=vertices.getX(i), y=vertices.getY(i), z=vertices.getZ(i)
    const warmth=Math.exp(-(((Math.abs(x)-.146)/.084)**2+((y+.058)/.053)**2))*smooth(z/.095)
    blush.push(1+.04*warmth,1-.24*warmth,1-.19*warmth)
  }
  cheek.setAttribute('color',new Float32BufferAttribute(blush,3))
  add(s,'head',piece(cheek,skin,zero,unit,undefined,true))
  for (const side of sides) {
    add(s,'head',oval(skin,[side*.224,-.017,-.005],[.047,.064,.037],[0,0,-side*.36],true),
      oval('#d88562',[side*.245,-.018,.024],[.022,.038,.011],[0,side*.32,-side*.35]))
    const k = side < 0 ? 'eyeL' : 'eyeR'
    const iris = ranger ? '#368779' : '#ab6233'
    const lid:Point[]=[[-.058,.011],[-.041,.031],[-.014,.039],[.015,.040],[.044,.037],
      [ranger ? .074 : .061, ranger ? .049 : .030],[.058,.007],[.050,-.019],[.032,-.035],[.004,-.043],[-.024,-.039],[-.046,-.023]]
    const white:Point[]=[[-.054,.007],[-.034,.021],[-.010,.027],[.020,.029],[.050,.026],
      [.052,.008],[.045,-.015],[.027,-.030],[.004,-.038],[-.021,-.034],[-.042,-.019]]
    const look = side*(ranger ? .014 : .012)
    // The little curved lash sits under the open eye and is uncovered by a blink.
    add(s,side<0 ? 'lidL':'lidR',eyePaint(plum,side,[[-.050,-.004],[-.027,.009],[.008,.016],
      [.035,.014],[.055,.010],[.040,.001],[.009,.007],[-.022,.003]],.0035))
    add(s,k,eyePaint(plum,side,lid,.005),
      eyePaint('#fff4db',side,white,.007),
      eyePaint(iris,side,irisShape(look-.001,-.001,.031,.035,.80),.009),
      eyePaint('#38283a',side,irisShape(look,.003,.019,.024,.91),.0105),
      eyePaint('#fff9eb',side,irisShape(look-side*.009,.014,.012,.0125),.013),
      eyePaint(ranger ? '#a5e6c3' : '#fbc378',side,irisShape(look+side*.009,-.018,.006,.005),.013))
    const brow: Point[] = [[-.060,-.003],[-.036,.014],[.018,.026],[.043,.023],[.069,.013],[.043,-.002],[-.035,-.012]]
    add(s,side<0 ? 'browL':'browR',decal(ranger ? '#683629' : '#602b24',brow.map(([x,y]) => [side*x,y]),
      [0,0,0],[0,side*.32,0]))
    for (let i=0;i<3;i++) add(s,'head',bead(ranger ? '#a76046' : '#c68359',
      [side*(.126+i*.018),-.042+Math.sin(i*2)*.009,.196-i*.007],[.006,.0049,.003]))
  }
  add(s,'head',oval(skin,[0,-.036,.200],[.035,.026,.034],[-.10,0,0]),
    bead('#fbd0a2',[-.005,-.034,.227],[.012,.007,.005]))
  if (ranger) {
    add(s,'head',smilePaint('#683238',[[-.075,-.079,-.078],[-.043,-.112,-.091],[-.008,-.129,-.095],
      [.029,-.126,-.091],[.057,-.106,-.079],[.078,-.068,-.067]],.004),
      smilePaint('#fff0d4',[[-.048,-.092,-.092],[-.012,-.107,-.096],[.025,-.104,-.093],[.06,-.080,-.080]],.006),
      smilePaint('#dd806b',[[-.020,-.122,-.122],[.002,-.126,-.117],[.018,-.125,-.116],[.029,-.122,-.122]],.006))
  } else {
    add(s,'head',smilePaint('#6c3533',[[-.066,-.103,-.101],[-.027,-.109,-.102],[.012,-.116,-.096],
      [.053,-.107,-.081],[.078,-.087,-.069],[.087,-.063,-.063]],.004),
      smilePaint('#fff0cc',[[-.026,-.103,-.103],[.012,-.108,-.098],[.049,-.101,-.084],[.077,-.072,-.072]],.006),
      smilePaint('#ca815b',[[.071,-.063,-.063],[.084,-.062,-.056],[.094,-.058,-.058]],.005))
  }
}

function swordsmanHair(s: Sculpt) {
  add(s,'head',piece(loft([[.072,.210,.179,0,-.009],[.104,.245,.202,0,-.009],[.179,.248,.204,-.006,-.013],
    [.232,.201,.173,-.020,-.018],[.265,.129,.123,-.035,-.019],[.279,.039,.047,-.048,-.009]]),
    '#863e2d',zero,unit,undefined,true))
  // The bangs follow a part above the right eyebrow and sweep past the left temple.
  const curls: [string,V3,V3,V3,number,number][] = [
    ['#9f4930',[.088,.206,.087],[.153,.139,.153],[.220,.061,.118],.074,.044],
    ['#783929',[.151,.165,.091],[.213,.077,.107],[.216,-.050,.103],.057,.043],
    ['#9e4a30',[-.161,.183,.070],[-.219,.091,.095],[-.236,-.035,.079],.061,.047],
    ['#a64f35',[-.017,.236,.040],[-.159,.196,.117],[-.323,.156,.101],.074,.045],
    ['#aa4d31',[.069,.246,.041],[.168,.218,.080],[.268,.176,.014],.067,.046],
    ['#c66a43',[.067,.229,.113],[.108,.162,.193],[.072,.089,.218],.051,.033],
    ['#8a402c',[-.099,.171,-.090],[-.19,.121,-.12],[-.269,.060,-.083],.068,.048],
    ['#8a402c',[.116,.194,-.111],[.199,.124,-.096],[.267,.081,-.051],.065,.045],
    ['#75382e',[0,.139,-.166],[-.022,.046,-.193],[-.066,-.070,-.177],.129,.046],
  ]
  for (const [c,a,b,t,w,d] of curls) add(s,'head',quill(c,a,b,t,w,d,[0,.35,1],true))
  addFringe(s,
    quill('#a74d31',[.095,.229,.068],[.018,.158,.182],[-.102,.067,.202],.075,.042,[0,.35,1],true),
    quill('#bf6440',[.062,.245,.068],[-.052,.200,.175],[-.211,.101,.147],.079,.047,[0,.35,1],true),
    quill('#e68954',[.058,.234,.152],[-.060,.202,.217],[-.182,.135,.180],.022,.007))
  add(s,'crest',
    quill('#ae5434',[.077,.051,-.024],[-.021,.149,-.005],[-.167,.215,-.021],.077,.045,[0,.75,.7],true),
    quill('#c86a40',[.076,.056,.032],[-.048,.145,.060],[-.235,.154,.071],.061,.048,[0,1,.7],true),
    quill('#df8551',[.056,.053,-.034],[.112,.136,-.040],[.120,.201,-.006],.042,.034,[0,.6,1],true),
    quill('#a45134',[-.008,.040,-.071],[-.114,.075,-.112],[-.249,.107,-.116],.078,.041,[0,1,0],true))
  add(s,'head',quill('#cb7047',[.110,.208,.167],[.123,.155,.214],[.075,.099,.226],.011,.006),
    quill('#70372c',[-.153,.198,.109],[-.235,.171,.115],[-.302,.159,.097],.015,.008),
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
      return [cx+rx*x,cy+ry*y+.023*x-brim*.038*Math.max(0,y)**9,
        z+brim*(.077*y-.038*x*x)]
    })
  }
  const rows = [
    opening(.023,.028,-.304,.214,0,-.143),opening(.132,.124,-.247,.143,0,-.084),
    opening(.243,.207,-.133,.065,0,-.043),opening(.285,.250,-.016,.026,0,-.012),
    opening(.264,.232,.086,.019,.20),opening(.249,.213,.134,.016,.69),
    opening(.227,.193,.156,.012,1),opening(.217,.183,.146,.011,1),opening(.211,.178,.118,.01,.83),
  ]
  const crown=skinRings(rows.slice(0,6),false)
  const dye:number[]=[]
  for(let i=0;i<crown.getAttribute('position').count;i++) {
    const angle=tau*(i%n)/n, row=Math.floor(i/n)
    const inset=Math.max(0,Math.cos(angle-1.42))**5
    const rim=smooth((row-2)/3)
    dye.push(1-.33*inset+.05*rim,1-.26*inset+.09*rim,1-.08*inset)
  }
  crown.setAttribute('color',new Float32BufferAttribute(dye,3))
  add(s,'head',piece(crown,leaf,zero,unit,undefined,true),
    piece(skinRings(rows.slice(5,8),false,false),lime),
    piece(skinRings(rows.slice(7),false,false),'#4e7132'))
  // A curved panel seam follows the drape from the notched brim to the trailing tip.
  for(const index of [4,31]) {
    const seam=rows.slice(0,6).map((row):V3=>[row[index][0]*1.012,row[index][1]+.005,row[index][2]])
    add(s,'head',cord('#60863a',seam,.0065,15))
    const edge=seam.map(([x,y,z]):V3=>[x+.007,y+.003,z])
    add(s,'head',cord('#a5b953',edge,.0045,15))
  }
  // Draw cord and built-in peak badge, with loose red-brown locks in the opening.
  addFringe(s,quill('#ac5836',[.113,.173,.105],[.035,.140,.177],[-.084,.084,.201],.052,.025),
    quill('#92442e',[-.013,.158,.112],[-.125,.106,.155],[-.193,.035,.131],.052,.029),
    quill('#a24d31',[.106,.165,.114],[.168,.104,.137],[.200,.006,.109],.051,.030))
  add(s,'head',piece(gem,'#98713a',[.015,.177,.234],[.080,.086,.030],[0,0,-.12]),
    piece(gem,gold,[.015,.179,.245],[.063,.069,.023],[0,0,-.12]),
    piece(gem,gilt,[.011,.184,.254],[.030,.035,.013]),
    quill(forest,[-.045,.197,-.139],[-.135,.195,-.215],[-.224,.150,-.263],.070,.050,[0,1,0],true))
  for (const side of sides) {
    add(s,'head',quill(side < 0 ? moss : leaf,[side*.189,.014,.085],[side*.229,-.081,.068],[side*.194,-.172,.098],.042,.030),
      cord('#a8c551',[[side*.246,-.012,.066],[side*.245,-.080,.075],[side*.202,-.163,.091]],.006),
      cord('#73912e',[[side*.229,.154,.022],[side*.199,.174,-.071],[side*.137,.172,-.168],[-.073,.186,-.264]],.004),
      quill(moss,[side*.237,.077,-.087],[side*.270,-.019,-.061],[side*.225,-.133,.018],.034,.021,[side,0,.2]),
      quill('#95b542',[side*.215,.106,-.086],[side*.263,.025,-.032],[side*.242,-.058,-.012],.018,.010,[side,0,.2]))
  }
  plume(s,'#f6db91','#d19e58',[.16,-.018,-.065],[.253,.064,-.075],[.345,.163,-.113],.039)
  plume(s,'#53ced1','#278f99',[.144,-.023,-.036],[.235,.075,-.032],[.255,.218,-.061],.052)
  add(s,'crest',piece(gem,gold,[.164,-.012,-.021],[.050,.069,.052]))
}

function plume(s: Sculpt, light: string, dark: string, a: V3, b: V3, tip: V3, w: number) {
  const path=new CatmullRomCurve3([a,b,tip].map(p=>new Vector3(...p)))
  // Each vane has its own scalloped edge. The raised shaft catches light between them.
  const stations=[[0,.06,.05],[.22,.63,.64],[.43,.99,.88],[.48,.56,.96],[.50,1,1],
    [.63,.90,.85],[.67,.81,.43],[.69,.80,.79],[.85,.39,.49],[1,0,0]]
  const vanes: V3[][]=[[],[]], shaft: V3[]=[]
  for (const [t,left,right] of stations) {
    const p=path.getPoint(t), tangent=path.getTangent(t)
    const across=new Vector3(tangent.y,-tangent.x,0).normalize()
    shaft.push([p.x,p.y,p.z+.011*Math.sin(Math.PI*t)])
    vanes[0].push(p.clone().addScaledVector(across,-w*left).toArray())
    vanes[1].push(p.clone().addScaledVector(across,w*right).toArray())
  }
  for (let side=0;side<2;side++) {
    const positions:number[]=[],indices:number[]=[]
    for(let i=0;i<shaft.length;i++) positions.push(...shaft[i],...vanes[side][i])
    for(let i=0;i<shaft.length-1;i++) {
      const k=i*2
      indices.push(k,k+1,k+2,k+1,k+3,k+2, k+2,k+1,k,k+2,k+3,k+1)
    }
    const g=new BufferGeometry()
    g.setAttribute('position',new Float32BufferAttribute(positions,3))
    g.setIndex(indices)
    // The vane folds along the shaft and each side catches the light separately.
    const facets=g.toNonIndexed()
    facets.computeVertexNormals()
    add(s,'crest',piece(facets,side ? dark : light))
  }
  add(s,'crest',cord('#ffedb4',shaft,.004,10))
}

function cape(s: Sculpt, ranger: boolean) {
  // Continuous pleats across the two sections; the hem is weighted to both pivots below.
  const rows = [0,.10,.31,.54,.75,.93,.966,1], n=25
  const colors = ranger ? [forest,moss,'#aac056'] : [midnight,cobalt,'#67a2ef']
  const pos: number[]=[], idx:number[]=[]
  for (const t of rows) for (const back of [0,1]) for (let i=0;i<n;i++) {
    const u=i/(n-1), w=ranger ? .74 : 1
    const fold = Math.cos(u*tau*3.3+.5)*(.013+t*.02)
    const x=(u-.5)*(.33+.40*t*w)+(ranger ? -.085 : .088)*t*t
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
  const sections = [[-.586,.001,.002],[-.486,.047,.014],[-.241,.055,.019],
    [-.209,.046,.018],[-.166,.072,.023],[-.118,.048,.018],[-.099,.037,.013]]
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
    add(s,'weapon',piece(g,[frost,'#8aa9cc',silver,'#7593b6'][face]))
  }
  add(s,'weapon',garment(umber,[[-.105,.025,.024],[-.066,.028,.027],[.045,.024,.023],[.064,.030,.027]]),
    piece(gem,gold,[0,.074,0],[.079,.084,.065]),
    piece(gem,aqua,[0,.077,.027],[.037,.039,.016]),
    oval(gold,[0,-.102,0],[.101,.025,.036],undefined,true),
    piece(gem,gilt,[0,-.106,.017],[.077,.064,.047]),
    piece(gem,'#338fb3',[0,-.106,.038],[.040,.042,.015]))
  for(const face of sides) {
    add(s,'weapon',decal('#508598',[[0,0],[.012,-.023],[0,-.052],[-.012,-.023]],
      [0,-.133,face*.024],[0,face<0 ? Math.PI : 0,0]),
      decal('#718da8',[[0,0],[.006,-.010],[.004,-.207],[0,-.243],[-.004,-.207],[-.006,-.010]],
        [0,-.199,face*.020],[0,face<0 ? Math.PI : 0,0]))
  }
  for (const side of sides) {
    add(s,'weapon',quill(gold,[side*.031,-.107,0],[side*.094,-.100,.002],[side*.140,-.058,0],.026,.024,[0,0,1],true),
      quill(gilt,[side*.048,-.101,.023],[side*.092,-.094,.022],[side*.129,-.074,.011],.008,.004))
  }
  for (let i=0;i<5;i++) add(s,'weapon',cord(hideLight,[[-.023,-.079+.025*i,.007],[0,-.071+.025*i,.028],[.025,-.067+.025*i,0]],.004))
}

function crossbow(s: Sculpt) {
  const p='weapon'
  const broadhead=skinRings([[.238,.010,.008],[.247,.045,.015],[.268,.042,.014],[.327,.001,.001]]
    .map(([z,w,d]):V3[]=>[[w,0,z],[0,-d,z],[-w,0,z],[0,d,z]]))
  // Local +Z is the bolt axis. Curved walnut limbs, ferrules and string form the crossbow silhouette.
  add(s,p,piece(loft([[-.181,.036,.030],[-.153,.043,.046],[-.064,.031,.032],
      [.027,.041,.037],[.172,.039,.036],[.224,.043,.033]],.60,12),hide,[0,.036,0],unit,[Math.PI/2,0,0],true),
    oval(hideLight,[0,.048,.094],[.049,.038,.135],undefined,true),
    oval('#425775',[0,.071,.108],[.035,.023,.137]),
    oval(gold,[0,.062,.200],[.061,.037,.036],undefined,true),
    oval(gold,[0,.051,-.106],[.044,.031,.015]),
    cord('#ffe4a1',[[-.190,.069,.062],[0,.088,-.087],[.190,.069,.062]],.006,2),
    cord('#dbaf7c',[[0,.099,-.113],[0,.099,.269]],.009,1),
    piece(broadhead,'#a4d8e3',[0,.099,0]),
    cord('#ae773e',[[.024,.019,.039],[.023,-.019,.033],[.022,-.032,.006],[.023,-.028,-.028],[.025,.013,-.045]],.008),
    quill('#5ac2c9',[0,.097,-.037],[.014,.109,-.068],[.019,.124,-.123],.011,.009,[0,1,0]))
  for (const d of sides) {
    add(s,p,quill('#ba7039',[d*.017,.062,.204],[d*.138,.065,.181],[d*.193,.066,.060],.031,.024,[0,1,0],true),
      cord(gilt,[[d*.047,.082,.203],[d*.119,.085,.178],[d*.158,.081,.138]],.005),
      oval(gold,[d*.184,.066,.088],[.017,.020,.024],[0,d*.39,0]),
      bead('#a5d757',[d*.188,.065,.074],[.014,.016,.015]),
      bead(gilt,[d*.04,.060,-.013],[.008,.009,.009]))
  }
  // A spare bolt turns at the pinch between her thumb and first finger.
  add(s,'bolt',cord('#dfaa68',[[0,-.139,0],[0,.134,0]],.0075,1),
    piece(gem,'#97c5d3',[0,-.147,0],[.049,.079,.022]),
    garment(gold,[[.076,.011,.011],[.091,.011,.011]],false))
  for (const d of sides) add(s,'bolt',quill(d<0 ? '#33b4b7' : '#a2e3d1',
    [0,.061,0],[d*.012,.105,0],[d*.027,.153,0],.015,.008))
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
    const side=k==='L' ? -1 : 1
    return {
      arm:{upper:bones[`shoulder${k}`],lower:bones[`elbow${k}`],end:bones[`hand${k}`],
        pole:new Vector3(side,-.53,-.62),first:.165,second:.160},
      leg:{upper:bones[`thigh${k}`],lower:bones[`knee${k}`],end:bones[`boot${k}`],
        pole:new Vector3(side*.31,0,1),first:.141,second:.132},
    }
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

// Both boots and grips use fixed-length links. Goals are in fighter space so contact
// holds when a caller scales or turns the complete figure in a party portrait.
function reach(r: Rig, chain: Rig['L']['arm'], x:number,y:number,z:number, rx:number,ry:number,rz:number) {
  const {upper,lower,end,first,second,pole}=chain
  const parent=upper.parent!
  r.target.set(x,y,z)
  r.group.localToWorld(r.target)
  parent.worldToLocal(r.target)
  r.target.sub(upper.position)
  const length=Math.max(Math.abs(first-second)+.0001,Math.min(first+second-.0001,r.target.length()))
  r.axis.copy(r.target).normalize()
  r.elbow.copy(pole)
  r.elbow.addScaledVector(r.axis,-r.elbow.dot(r.axis)).normalize()
  const along=(first*first-second*second+length*length)/(2*length)
  r.elbow.multiplyScalar(Math.sqrt(Math.max(0,first*first-along*along))).addScaledVector(r.axis,along)
  r.fore.copy(r.axis).multiplyScalar(length).sub(r.elbow).normalize()
  upper.quaternion.setFromUnitVectors(down,r.elbow.normalize())
  lower.quaternion.setFromUnitVectors(down,r.fore).premultiply(r.parentRotation.copy(upper.quaternion).invert())
  lower.getWorldQuaternion(r.parentRotation)
  r.wristRotation.setFromEuler(r.euler.set(rx,ry,rz,'YXZ')).premultiply(r.modelRotation)
  end.quaternion.copy(r.parentRotation.invert()).multiply(r.wristRotation)
}
function animate(r: Rig, pose: MenuPose, ranger: boolean) {
  const b=r.bones
  const t=Math.max(0,pose.t)
  const idle=pose.anim==='idle' ? t%8 : 0
  const cheer=pose.anim==='cheer' ? Math.min(t,1.6) : 0
  const sway=Math.sin(idle*tau/4), breath=Math.sin(idle*tau/2), lag=Math.sin(idle*tau/4-.65)
  const fidget=beat(idle,3.60,4.17,4.98,5.58)
  const gather=beat(cheer,0,.18,.21,.40), salute=beat(cheer,.18,.49,.88,1.47)
  const snap=beat(cheer,.28,.44,.46,.66), landing=beat(cheer,.74,.90,.92,1.17)
  const follow=beat(cheer,.27,.64,.94,1.60)
  const air=smooth((cheer-.20)/.57)
  const hop=ranger ? .129*4*air*(1-air) : 0
  b.hips.position.set((ranger ? -.058 : .043)+.013*sway+(ranger ? .026 : -.033)*salute,
    (ranger ? .338 : .343)+hop-.037*gather-(ranger ? .030 : .009)*landing,0)
  b.hips.rotation.set(.025,ranger ? -.18 : -.24,(ranger ? -.10 : .105)+.022*sway)
  b.spine.rotation.set((ranger ? .16 : -.085)+gather*.21-salute*.10,
    (ranger ? .03 : .24)+.044*sway+(ranger ? -.25 : .18)*salute,
    (ranger ? .25 : -.25)-.037*sway+(ranger ? -.19 : .20)*salute)
  b.chest.position.y=.22+.009*breath-.014*gather
  b.chest.rotation.set(-.030-.033*breath+.08*fidget,(ranger ? .17 : -.13)+.05*sway-.14*gather,
    (ranger ? -.06 : .045)+.024*breath)
  b.neck.rotation.set(-.05,.16+.06*sway, ranger ? -.06 : .035)
  b.neck.position.y=(ranger ? .158 : .147)-(ranger ? .012 : .043)*fidget
  const shrug=ranger ? 0 : fidget
  b.shoulderL.position.set(-.197,.094+.063*shrug,.058*shrug)
  b.head.rotation.set((ranger ? -.11 : -.07)+.025*breath+.19*fidget-.09*salute+.11*gather,
    (ranger ? .24 : .33)+.086*sway+(ranger ? .42 : -.24)*fidget+(ranger ? -.13 : .08)*salute,
    (ranger ? -.27 : -.095)+.036*sway+(ranger ? -.16 : .26)*fidget+.12*salute)
  b.crest.rotation.set(.057*lag-.23*follow+.12*landing,.035*sway,
    .062*lag+(ranger ? -.26 : .18)*follow-.17*fidget)
  const comb=ranger ? 0 : beat(idle,4.18,4.62,4.91,5.19)-.30*beat(idle,5.10,5.25,5.28,5.63)
  b.fringe.rotation.set(.026*lag-.10*follow,0,.025*lag-.26*comb+.050*landing)
  b.cape.rotation.set(.10+.073*lag+.32*follow,.075*sway+.30*follow,-.055+.21*follow)
  b.hem.rotation.set(.05+.097*Math.sin(idle*tau/4-1.1)+.19*follow-.14*landing,.15*lag+.14*follow,-.10*sway+.15*follow)
  const blink=beat(idle,2.03,2.096,2.12,2.24)+beat(idle,6.27,6.34,6.36,6.49)
  const wink=ranger ? beat(cheer,.49,.58,.92,1.08) : 0
  const shutL=Math.max(blink,wink)
  b.eyeL.scale.set(1.09,(ranger ? 1.12 : .90)*(1-.97*shutL),1)
  b.eyeR.scale.set(1.09,(ranger ? 1.14 : 1.09)*(1-.97*blink),1)
  b.eyeL.position.z=.207-.021*shutL
  b.eyeR.position.z=.207-.021*blink
  b.browL.position.y=.077-(ranger ? .006 : .019)-.011*wink+.008*gather
  b.browR.position.y=.086+.012*fidget+.010*salute
  b.browL.rotation.z=(ranger ? -.19 : -.32)-.10*gather
  b.browR.rotation.z=(ranger ? -.10 : -.18)+.09*fidget
  r.group.getWorldQuaternion(r.modelRotation)
  if (ranger) {
    reach(r,r.L.leg,-.177,.107+hop,.070,0,-.21,0)
    // Either front bevel can touch the floor as the heel rolls up.
    const toe=.25+.033*sway+.49*salute
    const toeY=Math.max(.107*Math.cos(toe)+.155*Math.sin(toe),.098*Math.cos(toe)+.166*Math.sin(toe))
    reach(r,r.R.leg,.169,toeY+hop+.047*salute,-.105-.044*salute,toe,.31,0)
    reach(r,r.L.arm,-.267+.047*salute,.602+.226*salute+hop+.013*breath,.200+.035*salute,
      -.18+.16*salute+.13*gather,-.61+.26*salute,-.71+.27*salute+.06*sway)
    reach(r,r.R.arm,.301+.068*fidget+.014*salute,.606+.110*fidget+.028*salute+hop+.014*sway,
      .182+.020*fidget,-.61+.45*fidget-.27*salute,.39-.20*fidget,-.29-.15*fidget)
    const roll=smooth((idle-4.10)/.79)%1
    b.bolt.rotation.z=-.65+.075*sway-.40*beat(idle,3.88,4.09,4.10,4.32)+tau*roll+.16*beat(idle,4.72,4.88,4.91,5.12)
  } else {
    reach(r,r.L.leg,-.164,.107,.091,0,-.39,0)
    reach(r,r.R.leg,.202,.107,-.048,0,.27,0)
    // The blade pivots on its point during the crouch, lifts clear, then sweeps up.
    const rake=.40-.10*gather
    const plantedY=.586*Math.cos(.30)*Math.cos(rake)+.0006
    const lift=beat(cheer,.11,.30,1.30,1.56)
    reach(r,r.R.arm,.313+.113*salute,plantedY*(1-salute)+.923*salute+.038*snap+.095*lift*(1-salute),.143+.058*salute,
      .30-3.37*salute-.13*snap,.44-.32*salute,rake+.25*beat(cheer,.20,.34,.38,.53)-.04*salute)
    const brush=smooth((idle-4.19)/.56)
    reach(r,r.L.arm,-.132+(.101-.174*brush)*fidget-.17*salute,.526+.510*fidget+.078*salute,
      .166+(.141-.073*brush)*fidget+.028*salute,-.58-2.12*fidget-.47*salute,.20+1.04*fidget,.95-.62*fidget-.48*salute)
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
