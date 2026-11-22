import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide, Bone, BufferGeometry, CatmullRomCurve3, Color, Euler, Float32BufferAttribute, Group,
  MeshBasicMaterial, Quaternion, Skeleton, SkinnedMesh, SphereGeometry, Sprite, TorusGeometry,
  TubeGeometry, Uint16BufferAttribute, Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BlobShadow } from '../Effects'
import { lightHalo } from '../MagicEffects'
import { bake, toon, type Part, type V3 } from '../kit'
import type { MenuPose } from './menuPose'

type Caster = 'priestess' | 'mage' | 'maestro'
type Props = { pose: MenuPose }
type Row = [y: number, rx: number, rz: number, x?: number, z?: number]
type Section = [x: number, y: number, z: number, width: number, depth: number]
type Layer = Part[]
const tau = 2 * Math.PI
const sphere = new SphereGeometry(1, 14, 9)
const bead = new SphereGeometry(1, 8, 5)
const rim = new TorusGeometry(1, .095, 7, 36)
const ink = new MeshBasicMaterial({ color: '#2a1a38', side: BackSide })
const gold = '#e8a434', brass = '#aa6127', gilt = '#ffdc78', ivory = '#ffefd5'
const teal = '#179d9d', jade = '#56d4c3', plum = '#4c285d', violet = '#6941a1'
const skin = '#edab80', peach = '#ffd0a1'
const blonde = '#edaa46', flax = '#ffcf70', amber = '#ba7036'
const wool = '#fff1de', grey = '#c6b8c3', voidBlack = '#0f0918'

// Closed cross sections. Shared vertices round the ridges of hair and fabric.
function rings(loops: V3[][], closed = true) {
  const n = loops[0].length, indices: number[] = []
  for (let j = 0; j + 1 < loops.length; j++) for (let i = 0; i < n; i++) {
    const a = j*n+i, b = j*n+(i+1)%n
    indices.push(a,b,a+n, b,b+n,a+n)
  }
  const end = (loops.length-1)*n
  if (closed) for (let i = 1; i < n-1; i++) indices.push(0,i+1,i,end,end+i,end+i+1)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(loops.flat(2), 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

function loft(rows: Row[], segments = 24, shape = 1, ripple = 0,
  lift?: (angle: number, row: number) => number) {
  return rings(rows.map(([y,rx,rz,x=0,z=0], j) => Array.from({ length: segments }, (_,i): V3 => {
    const a = tau*i/segments, u = Math.sin(a), v = Math.cos(a)
    const fold = 1 + ripple*(1-j/(rows.length-1))*(Math.cos(7*a+.4)+.35*Math.cos(3*a))
    return [x+rx*fold*Math.sign(u)*Math.abs(u)**shape, y+(lift?.(a,j) ?? 0),
      z+rz*fold*Math.sign(v)*Math.abs(v)**shape]
  })))
}

// A tapered brush stroke in 3D. Width lies across its path and depth towards
// the viewer. The same sweep sculpts swept bangs, embroidery and curling claws.
function sweep(points: Section[], segments = 12) {
  const path = new CatmullRomCurve3(points.map(p => new Vector3(p[0],p[1],p[2])))
  const count = (points.length-1)*3
  return rings(Array.from({ length: count+1 }, (_,i) => {
    const t = i/count, p = path.getPoint(t), dir = path.getTangent(t)
    const side = new Vector3(dir.y,-dir.x,0)
    if (side.lengthSq() < .00001) side.set(1,0,0)
    side.normalize()
    const front = new Vector3().crossVectors(side,dir).normalize()
    const j = Math.min(points.length-2, Math.floor(i/3)), f = i/3-j
    const w = (1-f)*points[j][3]+f*points[j+1][3], d = (1-f)*points[j][4]+f*points[j+1][4]
    return Array.from({length:segments}, (_,k): V3 => {
      const a = tau*k/segments
      return p.clone().addScaledVector(side, w*Math.sin(a)).addScaledVector(front,d*Math.cos(a)).toArray()
    })
  }))
}

// Slightly crowned foil appliqué, in front view, with a bevel around its edge.
function leaf(points: number[][], depth = .012) {
  const cx = points.reduce((s,p) => s+p[0],0)/points.length
  const cy = points.reduce((s,p) => s+p[1],0)/points.length
  const area = points.reduce((a,p,i) => {
    const q = points[(i+1)%points.length]
    return a+p[0]*q[1]-q[0]*p[1]
  },0)
  const outline = area < 0 ? [...points].reverse() : points
  return rings([[.92,-depth],[1,0],[.88,depth*.56],[.04,depth]].map(([size,z]) =>
    outline.map(([x,y]): V3 => [cx+(x-cx)*size,cy+(y-cy)*size,z])))
}
function add(layer: Layer, g: BufferGeometry, c: string, p?: V3, s?: V3, r?: V3, outline = false) {
  layer.push({g,c,p,s,r,ink:outline})
}
function oval(layer: Layer, c: string, p: V3, s: V3, r?: V3, outline = false) {
  add(layer,sphere,c,p,s,r,outline)
}
function line(layer: Layer, c: string, points: V3[], radius: number) {
  const path = new CatmullRomCurve3(points.map(p => new Vector3(...p)))
  add(layer,new TubeGeometry(path,(points.length-1)*3,radius,6,false),c)
}
function stroke(layer: Layer, c: string, points: Section[], outline = false, segments = 12) {
  add(layer,sweep(points,segments),c,undefined,undefined,undefined,outline)
}
const jewel = leaf([[0,1],[.77,.04],[0,-1],[-.77,.04]],.48)
function brooch(layer: Layer, p: V3, size: number, hue: string) {
  add(layer,jewel,brass,p,[size,size*1.16,size*.36])
  add(layer,jewel,gilt,[p[0],p[1]+.004,p[2]+.005],[size*.91,size*1.07,size*.36])
  add(layer,jewel,hue,[p[0],p[1]+.005,p[2]+.011],[size*.66,size*.79,size*.50])
}
const star = leaf([[0,1],[.19,.22],[.7,0],[.17,-.18],[0,-1],[-.18,-.19],[-.7,0],[-.17,.19]],.12)

type Weight = { to: string; low: number; high: number }
type Swatch = { joint: string; parts: Layer; light: boolean; weight?: Weight }
type Pivot = { name: string; parent: string; at: V3 }
class Sculpture {
  pivots: Pivot[] = []
  swatches: Swatch[] = []
  pivot(name: string, parent: string, at: V3) {
    this.pivots.push({name,parent,at})
  }
  layer(joint: string, light = false, weight?: Weight) {
    const parts: Layer = []
    this.swatches.push({joint,parts,light,weight})
    return parts
  }
}

function finish(sculpt: Sculpture) {
  const passes: BufferGeometry[][] = [[],[],[]]
  const index = new Map(sculpt.pivots.map((p,i) => [p.name,i]))
  for (const {joint,parts,light,weight} of sculpt.swatches) {
    if (!parts.length) continue
    const batch = bake(parts,light ? 0 : .0032)
    if (!light) {
      // Painted fill from the upper left stays legible under the menu's strong
      // ambient light. Bake it in bind space so it follows each fold as it moves.
      const color=batch.color.getAttribute('color'), normal=batch.color.getAttribute('normal')
      for (let i=0;i<color.count;i++) {
        const lightness=.5+.5*(-.53*normal.getX(i)+.71*normal.getY(i)+.46*normal.getZ(i))
        const fill=lightness*lightness
        color.setXYZ(i,color.getX(i)*(.53+.67*fill),color.getY(i)*(.40+.77*fill),color.getZ(i)*(.53+.52*fill))
      }
    }
    function skinGeometry(g: BufferGeometry, pass: number) {
      const pos = g.getAttribute('position'), ids = [], weights = []
      for (let i = 0; i < pos.count; i++) {
        const f = weight ? Math.max(0,Math.min(1,(pos.getY(i)-weight.low)/(weight.high-weight.low))) : 0
        ids.push(index.get(joint)!,weight ? index.get(weight.to)! : 0,0,0)
        weights.push(1-f,f,0,0)
      }
      g.setAttribute('skinIndex',new Uint16BufferAttribute(ids,4))
      g.setAttribute('skinWeight',new Float32BufferAttribute(weights,4))
      passes[pass].push(g)
    }
    skinGeometry(batch.color,light ? 2 : 0)
    if (batch.hull) skinGeometry(batch.hull,1)
  }
  return {pivots:sculpt.pivots, geometry:passes.map(gs => mergeGeometries(gs)!)}
}

// All sculpture coordinates below are in the same standing bind pose. Vertices
// at the waist, hem, beard and hat bend between pivots. Accessories follow rigidly.
function foundation(kind: Caster) {
  const s = new Sculpture(), master = kind === 'maestro', mage = kind === 'mage'
  const shoulder = master ? .86 : mage ? .70 : .735
  const eye = master ? 1.096 : mage ? .977 : 1.058
  s.pivot('hips','',[0,.45,0])
  s.pivot('spine','hips',[0,.49,0])
  s.pivot('chest','spine',[0,shoulder-.07,0])
  s.pivot('neck','chest',[0,master ? .90 : .76,0])
  s.pivot('head','neck',[0,eye-.15,0])
  s.pivot('eyes','head',[0,eye,.185])
  s.pivot('hem','hips',[0,.47,0])
  s.pivot('train','chest',[0,shoulder+.02,-.10])
  s.pivot('mane','head',[0,eye+.09,-.05])
  s.pivot('beard','head',[0,.90,.154])
  s.pivot('tip','head',[0,mage ? 1.27 : 1.30,0])
  for (const side of [-1,1]) {
    const id = side < 0 ? 'L' : 'R'
    s.pivot('leg'+id,'hips',[side*.114,.30,0])
    s.pivot('shoulder'+id,'chest',[side*(master ? .193 : .161),shoulder,0])
    s.pivot('elbow'+id,'shoulder'+id,[side*(master ? .316 : .245),shoulder-.096,.045])
    s.pivot('wrist'+id,'elbow'+id,[side*(master ? .302 : side < 0 ? .327 : .253),
      shoulder-(master ? .128 : side < 0 ? .084 : .153),master ? .176 : .137])
    if (master) for (let i=0;i<4;i++) s.pivot('claw'+id+i,'wrist'+id,
      [side*(.30+(i-1.5)*.027),shoulder-.133,.245])
  }
  s.pivot('staff','wristL',[-.345,shoulder-.063,.155])
  s.pivot('burst','staff',[-.437,mage ? 1.187 : 1.207,.16])
  s.pivot('blessing','wristR',[.250,.558,.228])
  return s
}

function boots(s: Sculpture) {
  for (const side of [-1,1]) {
    const layer = s.layer(side<0 ? 'legL' : 'legR')
    const x = side*.120, z = side*.029
    const foot = (rows: Row[]) => loft(rows,20,.76)
    add(layer,foot([[.003,.082,.114,x,z+.031],[.017,.091,.122,x,z+.037],[.037,.092,.120,x,z+.036]]),'#583846')
    add(layer,foot([[.028,.09,.120,x,z+.035],[.062,.092,.122,x,z+.036],
      [.097,.088,.117,x,z+.029],[.129,.073,.077,x,z],[.235,.062,.069,x,z]]),'#9c6244',undefined,undefined,undefined,true)
    add(layer,foot([[.103,.077,.087,x,z+.004],[.126,.078,.081,x,z]]),'#774639')
    add(layer,jewel,gold,[x,.103,z+.092],[.032,.023,.012],[.32,0,0])
  }
}

function vestments(s: Sculpture, mage: boolean) {
  const main = mage ? violet : ivory
  const lower = s.layer('hips',false,{to:'hem',low:.48,high:.18})
  const fall = (a: number) => .016*Math.cos(3*a+.25)-.015*Math.cos(a)
  const skirt: Row[] = [[.132,.270,.191,0,.001],[.149,.277,.198],[.211,.266,.186],
    [.337,.209,.150,.008],[.47,.150,.118,.014],[.535,.153,.116,.012]]
  add(lower,loft(skirt,42,.92,.057,(a,j) => fall(a)*(1-j/5)),main,undefined,undefined,undefined,true)
  add(lower,loft([[.143,.279,.201],[.157,.280,.201],[.169,.276,.198]],42,.92,.049,a=>fall(a)),gold)
  // Split stole: a broad coloured silk panel, piped on both sides.
  const panel: Section[] = [[.016,.484,.120,.060,.010],[.024,.389,.142,.062,.012],
    [.031,.286,.171,.068,.014],[.045,.198,.201,.072,.014],[.057,.152,.205,.005,.006]]
  stroke(lower,gold,panel)
  stroke(lower,mage ? '#369caa' : teal,panel.map(([x,y,z,w,d])=>[x,y+.005,z+.004,w*.83,d]))
  add(lower,star,gilt,[.036,.273,.190],[.025,.047,.018],[-.16,0,-.07])
  const top = s.layer('spine',false,{to:'chest',low:.48,high:.67})
  add(top,loft([[.43,.15,.118],[.50,.153,.119],[.63,.192,.134],[.70,.207,.132],
    [.738,.15,.116],[.77,.086,.087]],24,.87),main,undefined,undefined,undefined,true)
  const belt = s.layer('hips')
  add(belt,loft([[.439,.157,.126,.014],[.453,.160,.128,.015],[.501,.158,.124,.012]],28,.89,0,a=>.009*Math.sin(a)),
    mage ? '#75503c' : teal)
  add(belt,loft([[.483,.160,.126,.013],[.498,.159,.127,.012]],28,.89,0,a=>.009*Math.sin(a)),mage ? brass : jade)
  brooch(belt,[.041,.473,.135],.038,mage ? '#da5940' : jade)
  const embroidery=mage ? '#ccb0d0' : '#daa851'
  for (const side of [-1,1]) {
    for (let i=0;i<3;i++) {
      const x=side*(.097+.026*i), y=.200+.029*i, z=.184-.019*i
      add(lower,jewel,embroidery,[x,y,z],[.009,.016,.005],[-.37,side*.48,side*.43])
    }
  }
  const pouch = s.layer('hips')
  oval(pouch,'#915031',[.155,.398,.068],[.061,.066,.037],[0,.52,-.17],true)
  oval(pouch,'#b37145',[.158,.420,.085],[.059,.039,.029],[0,.52,-.17])
  add(pouch,bead,gilt,[.173,.411,.112],[.010,.012,.006])
  for(let i=0;i<5;i++) add(pouch,bead,'#e9b475',[.126+i*.012,.408-.008*Math.sin(i*.75),.106-i*.003],
    [.004,.002,.002])
  const cape = s.layer('chest',false,{to:'train',low:.72,high:.35})
  add(cape,loft([[.269,.20,.058,0,-.145],[.286,.211,.064,0,-.145],
    [.49,.19,.07,0,-.108],[.691,.207,.098,0,-.057],[.749,.111,.079,0,-.044]],32,.88,.055,
  (a,j)=>.027*Math.sin(3*a)*(1-j/4)),mage ? plum : '#e8c59e',undefined,undefined,undefined,true)
  const mantle = s.layer('chest')
  const dip = (a: number) => -.064*Math.max(0,Math.cos(a))**3
  add(mantle,loft([[.673,.220,.157],[.689,.227,.162],[.732,.185,.137],[.763,.101,.094]],
    32,.94,0,(a,j)=>dip(a)*(1-j/3)),mage ? '#52316e' : '#fff2d8',undefined,undefined,undefined,true)
  add(mantle,loft([[.670,.223,.160],[.683,.229,.165]],32,.94,0,dip),gold)
  if (!mage) stroke(mantle,teal,[[.122,.751,.049,.032,.011],[.097,.712,.116,.043,.014],
    [.054,.661,.150,.048,.015],[0,.600,.140,.044,.012],[-.064,.526,.117,.034,.008]])
  brooch(mantle,[mage ? .108 : .09,.700,.135],.024,mage ? '#db6564' : jade)
  if (!mage) {
    for(const side of [-1,1]) for(let i=0;i<3;i++)
      add(mantle,jewel,'#dfb569',[side*(.119+i*.028),.683+i*.008,.142-i*.018],[.011,.022,.006],
        [-.22,side*.48,side*(-.68+.08*i)])
  }
}

const eyeShape = leaf([[-1,.05],[-.78,.57],[-.26,.91],[.36,.94],[.82,.61],[1,.18],
  [.84,-.28],[.32,-.70],[-.26,-.79],[-.76,-.54]],.13)

function face(s: Sculpture, mage: boolean) {
  const h = s.layer('head'), eyes = s.layer('eyes'), y = mage ? .977 : 1.058
  const tone = mage ? '#e4a17c' : skin
  const neck=s.layer('neck')
  add(neck,loft([[.733,.078,.067,0,-.008],[.784,.090,.077,0,-.004],
    [y-.146,.082,.080,0,.009],[y-.104,.096,.088,0,.012]],18),tone)
  if(!mage) {
    add(neck,loft([[.733,.103,.090],[.749,.113,.092],[.792,.097,.087],[.811,.092,.083]],24,.94),
      '#fff2dd',undefined,undefined,undefined,true)
    add(neck,loft([[.792,.099,.089],[.800,.098,.088]],24,.94),gold)
  }
  add(h,loft([[y-.185,.057,.070,0,.034],[y-.163,.126,.114,0,.030],
    [y-.117,.177,.148,0,.022],[y-.060,.207,.165,0,.012],[y+.025,.214,.170,0,.008],
    [y+.112,.205,.165],[y+.175,.163,.131],[y+.20,.085,.091]],28,.85),
  tone,undefined,undefined,undefined,true)
  oval(h,peach,[0,y-.052,.184],mage ? [.054,.041,.048] : [.031,.026,.029])
  for (const side of [-1,1]) {
    const x=side*.087, yaw=side*.38
    const tilt: V3=[-.017,yaw,side*(mage ? .13 : .065)]
    const eyeHeight=mage ? .043 : .047
    add(eyes,eyeShape,'#462d35',[x,y,.174],[.069,eyeHeight*1.10,.059],tilt)
    add(eyes,eyeShape,'#fff4df',[x,y-.004,.177],[.061,eyeHeight*.90,.060],tilt)
    oval(eyes,'#32252d',[x-.004,y-.001,.185],[.031,eyeHeight*.82,.010],tilt)
    oval(eyes,mage ? '#aa7738' : '#417f70',[x-.005,y-.005,.191],[.024,eyeHeight*.66,.008],tilt)
    oval(eyes,'#29232d',[x-.005,y+.002,.198],[.015,eyeHeight*.48,.005],tilt)
    add(eyes,bead,'#fff9df',[x-.013,y+.011,.203],[.008,.009,.004],tilt)
    const brow = mage ? wool : '#976035'
    stroke(h,brow,[[side*.029,y+.048,.186,.012,.010],[side*.069,y+(mage?.061:.073),.184,.019,.016],
      [side*.123,y+.079,.162,.021,.017],[side*.165,y+(mage?.089:.059),.128,.003,.003]],mage)
    if (mage) {
      stroke(h,grey,[[side*.063,y+.039,.179,.005,.005],[side*.100,y+.047,.177,.014,.012],
        [side*.143,y+.055,.147,.007,.006],[side*.180,y+.066,.120,.001,.001]])
      oval(h,tone,[side*.207,y-.016,-.002],[.038,.060,.038],[0,0,-side*.22])
    } else {
      const ear = leaf([[0,-.047],[.036,-.043],[.104,.002],[.17,.111],[.087,.078],[.018,.061],[-.014,.030]]
        .map(([u,v])=>[side*u,v]),.024)
      const earPos: V3 = [side*.166,y-.032,-.004]
      const earRot: V3 = [0,-side*.20,0]
      add(h,ear,tone,earPos,[1,1,1],earRot,true)
      add(h,ear,'#cb8073',[side*.192,y-.021,.020],[.68,.60,.36],earRot)
      add(h,bead,gilt,[side*.236,y-.044,.014],[.016,.017,.015])
      add(h,jewel,teal,[side*.235,y-.070,.014],[.016,.024,.015])
      oval(h,'#e79879',[side*.141,y-.055,.150],[.031,.012,.004],[0,side*.62,-side*.10])
      for (let i=0;i<3;i++) add(h,bead,'#ae6850',[side*(.115+i*.014),y-.051+.004*(i%2),.169-i*.009],
        [.0033,.003,.002])
    }
  }
  if (!mage) {
    stroke(h,'#934f4d',[[-.042,y-.104,.165,.002,.003],[-.022,y-.113,.176,.005,.004],
      [.008,y-.115,.181,.005,.004],[.038,y-.104,.170,.002,.003]])
    stroke(h,'#f0a080',[[-.025,y-.120,.168,.002,.002],[0,y-.124,.173,.005,.003],[.025,y-.118,.170,.002,.002]])
  }
}

function priestHair(s: Sculpture) {
  const h=s.layer('head'), hair=s.layer('head',false,{to:'mane',low:1.14,high:.81})
  add(h,loft([[1.09,.216,.171,0,-.008],[1.17,.224,.184],[1.236,.195,.166],
    [1.277,.125,.102],[1.285,.057,.043]]),blonde)
  add(hair,loft([[.624,.126,.052,0,-.129],[.664,.170,.072,0,-.140],[.793,.205,.076,0,-.133],
    [.982,.210,.110,0,-.094],[1.149,.201,.136,0,-.044]],32,.84,.07),amber,undefined,undefined,undefined,true)
  for (const side of [-1,1]) {
    // The long locks go behind the ears first, then turn out across the collar.
    const locks: Section[] = [[side*.153,1.191,.069,.054,.044],[side*.202,1.102,.092,.055,.040],
      [side*.196,.984,.092,.049,.042],[side*.208,.882,.127,.047,.040],
      [side*.245,.792,.102,.044,.034],[side*.240,.720,.090,.030,.024],[side*.205,.673,.084,.002,.002]]
    stroke(hair,blonde,locks,true,14)
    stroke(hair,flax,locks.map(([x,y,z,w,d])=>[x-side*.016,y,z+d*.77,w*.30,d*.26]))
    stroke(hair,'#d58b3d',[[side*.169,1.13,-.103,.061,.048],[side*.213,.957,-.107,.059,.046],
      [side*.204,.807,-.067,.055,.045],[side*.260,.686,-.052,.039,.036],[side*.275,.646,-.038,.002,.002]])
  }
  // A sweeping side part leaves the eyes clear.
  stroke(h,flax,[[.080,1.225,.109,.023,.023],[.040,1.218,.159,.058,.033],
    [-.044,1.187,.175,.050,.034],[-.125,1.151,.154,.039,.026],[-.177,1.084,.125,.022,.020],
    [-.185,1.047,.112,.002,.002]],true)
  stroke(h,blonde,[[.080,1.227,.104,.021,.022],[.121,1.196,.146,.043,.031],
    [.166,1.157,.138,.035,.026],[.180,1.110,.116,.020,.016],[.179,1.088,.111,.002,.002]])
  stroke(h,'#ffdd87',[[.070,1.238,.149,.002,.002],[.013,1.218,.184,.008,.005],
    [-.072,1.183,.195,.007,.006],[-.133,1.154,.177,.001,.001]])
  // The veil is open in front. Its lip climbs above the fringe and falls behind the ears.
  const edge=(a:number)=>.079*Math.cos(a)+.018*Math.cos(2*a+.15)
  add(h,loft([[1.152,.231,.188,0,-.007],[1.169,.235,.195,0,-.008],
    [1.237,.212,.182,-.012,-.011],[1.290,.145,.125,-.020,-.024],[1.307,.061,.063,-.029,-.028]],
    36,.93,0,(a,j)=>edge(a)*(1-j/4)),ivory,undefined,undefined,undefined,true)
  add(h,loft([[1.152,.234,.192,0,-.006],[1.167,.237,.198,0,-.006]],36,.93,0,edge),gold)
  brooch(h,[.006,1.246,.184],.030,jade)
  for (const side of [-1,1]) for (let i=0;i<3;i++) {
    const x=side*(.069+.042*i), y=1.255-i*.015, z=.174-i*.020
    add(h,jewel,gold,[x,y,z],[.012,.021,.010],[.35,side*.40,side*(-.65+.12*i)])
  }
}

function wizardFinery(s: Sculpture) {
  const head=s.layer('head'), beard=s.layer('head',false,{to:'beard',low:.92,high:.72})
  for (const side of [-1,1]) {
    stroke(head,grey,[[side*.145,1.082,-.019,.059,.057],[side*.197,.989,-.033,.052,.053],
      [side*.211,.906,-.024,.051,.043],[side*.228,.845,.003,.030,.028],[side*.205,.819,.018,.002,.002]],true)
    stroke(head,wool,[[side*.181,1.070,.010,.048,.037],[side*.196,.993,.034,.046,.041],
      [side*.203,.934,.035,.032,.031],[side*.229,.906,.048,.002,.002]])
  }
  add(beard,loft([[.605,.009,.013,.009,.205],[.646,.073,.064,.016,.192],[.718,.128,.084,.008,.177],
    [.816,.172,.102,0,.134],[.880,.179,.094,0,.111],[.922,.156,.063,0,.105]],24,.92),grey,undefined,undefined,undefined,true)
  for (let i=-2;i<=2;i++) {
    const x=i*.058, a=Math.abs(i), y=.593+a*.045
    stroke(beard,i%2===0 ? '#eee3d9' : '#e3d7d1',[[x,.894-a*.004,.179-a*.017,.054,.039],
      [x*.99,.813,.220-a*.017,.059,.045],[x*.92+.004,.741+a*.018,.236-a*.017,.046,.033],
      [x*.91+.023,y+.037,.242-a*.012,.021,.020],[x*.85+.014,y,.244-a*.012,.002,.002]])
  }
  oval(head,'#784552',[0,.865,.222],[.044,.025,.016])
  for (const side of [-1,1]) {
    stroke(head,wool,[[side*.006,.891,.217,.015,.017],[side*.047,.906,.218,.031,.029],
      [side*.087,.895,.214,.027,.027],[side*.128,.879,.190,.024,.021],
      [side*.166,.898,.168,.015,.017],[side*.176,.918,.153,.002,.002]],true)
  }
  oval(head,'#efad87',[0,.924,.208],[.056,.041,.047],[-.04,0,-.07])
  const wave=(a:number)=>.021*Math.sin(a)+.017*Math.cos(2*a+.7)-.018*Math.cos(a)
  add(head,loft([[1.086,.309,.227],[1.091,.327,.239],[1.108,.335,.247],
    [1.122,.305,.227],[1.137,.217,.167]],40,.95,0,(a,j)=>wave(a)*(1-j*.13)),'#654099',undefined,undefined,undefined,true)
  add(head,loft([[1.097,.333,.244],[1.104,.337,.248]],40,.95,0,a=>wave(a)*.79),'#aa70c4')
  const hat=s.layer('head',false,{to:'tip',low:1.248,high:1.380})
  add(hat,loft([[1.108,.227,.177],[1.162,.221,.175,-.005],[1.249,.175,.144,.001,-.005],
    [1.317,.132,.113,.030,-.018],[1.371,.095,.086,.082,-.026],[1.399,.063,.055,.145,-.024],
    [1.390,.042,.040,.205,-.024],[1.352,.027,.025,.245,-.013],[1.304,.004,.006,.269,.002]],32,.97,.025),
    '#7346a5',undefined,undefined,undefined,true)
  add(head,loft([[1.126,.240,.190,-.004],[1.139,.240,.191,-.005],[1.183,.222,.182,-.004],
    [1.190,.215,.178,-.004]],36,.98,0,a=>.010*Math.sin(a-.7)),gold)
  add(head,loft([[1.170,.230,.185,-.004],[1.182,.225,.184,-.004]],36,.98,0,a=>.010*Math.sin(a-.7)),gilt)
  brooch(head,[-.064,1.150,.181],.031,teal)
  line(hat,'#d29db8',[[-.054,1.256,.144],[-.012,1.275,.138],[.075,1.294,.114]],.0024)
  for (const [x,y,z,size] of [[-.059,1.255,.140,.023],[.079,1.294,.111,.016],[.113,1.338,.073,.010]]) {
    add(hat,star,'#d29db8',[x,y,z],[size,size*1.28,.015],[.33,x*2,-.18])
  }
  add(s.layer('tip'),jewel,gold,[.268,1.294,.002],[.016,.025,.017])
}

function overlord(s: Sculpture) {
  const skirt=s.layer('spine',false,{to:'hem',low:.66,high:.23})
  const tear=(a:number)=>.061*Math.cos(9*a+.36)+.026*Math.sin(4*a+.6)
  const folds=loft([[.216,.265,.197,0,-.010],[.231,.265,.196,0,-.010],[.306,.255,.187],[.453,.204,.159],
    [.620,.156,.122],[.710,.168,.124],[.816,.201,.138],[.878,.196,.125]],54,.94,.092,
  (a,j)=>tear(a)*Math.max(0,1-Math.max(0,j-1)*.45))
  const pigment=[], dye=new Color()
  for(let i=0;i<folds.getAttribute('position').count;i++){
    const row=Math.floor(i/54), a=i%54*tau/54
    dye.set(row===0?'#b26cc6':row===1?'#80399c':'#762a9b')
    const pleat=.84+.16*Math.cos(7*a+.4)
    pigment.push(dye.r*pleat,dye.g*pleat,dye.b*pleat)
  }
  folds.setAttribute('color',new Float32BufferAttribute(pigment,3))
  add(skirt,folds,'#ffffff',undefined,undefined,undefined,true)
  const tabard: Section[] = [[0,.804,.146,.084,.014],[0,.716,.145,.083,.016],[-.009,.585,.152,.073,.010],
    [-.006,.419,.188,.078,.013],[-.029,.297,.202,.060,.016],[-.010,.207,.207,.002,.004]]
  stroke(skirt,'#ce8240',tabard)
  stroke(skirt,'#8532ae',tabard.map(([x,y,z,w,d])=>[x,y+.008,z+.005,w*.88,d]))
  // A small three-spired keep is stitched into the tabard.
  add(skirt,leaf([[-.032,.036],[-.021,.023],[-.015,.029],[-.014,.045],[-.006,.031],[0,.054],
    [.008,.031],[.017,.044],[.016,.022],[.032,.036],[.024,-.015],[0,-.031],[-.023,-.015]],.004),
  '#edb966',[-.008,.378,.220])
  add(skirt,jewel,'#7a3295',[-.008,.386,.226],[.012,.017,.005])
  const cape = s.layer('chest',false,{to:'train',low:.862,high:.36})
  add(cape,loft([[.242,.240,.063,0,-.160],[.365,.222,.075,0,-.143],
    [.643,.180,.092,0,-.088],[.830,.217,.118,0,-.042],[.892,.156,.106,0,-.027]],
  48,.9,.08,(a,j)=>tear(a)*(1-j/4)),'#4b205f',undefined,undefined,undefined,true)
  const chest = s.layer('chest')
  const dip=(a:number)=>-.072*Math.cos(a)**4
  add(chest,loft([[.801,.245,.171],[.826,.254,.181],[.875,.203,.152],[.905,.147,.112]],36,.88,0,
    (a,j)=>dip(a)*(1-j/3)),'#972fb5',undefined,undefined,undefined,true)
  add(chest,loft([[.798,.247,.174],[.809,.250,.178]],36,.88,0,dip),'#d38a3f')
  brooch(chest,[0,.805,.190],.042,'#fc9937')
  const hood=s.layer('head',false,{to:'tip',low:1.315,high:1.424})
  // A pointed opening around a recessed, completely dark lining. Each band
  // runs back over the crown into the swept hood tail.
  const aperture=[[.022,.221],[-.073,.176],[-.157,.121],[-.210,.062],[-.228,-.012],
    [-.222,-.080],[-.182,-.134],[-.101,-.168],[-.018,-.179],[.079,-.166],[.165,-.130],
    [.214,-.079],[.221,-.004],[.204,.065],[.149,.125],[.081,.173]]
  function hoodRing(w:number,h:number,x:number,y:number,z:number,ridge=0): V3[] {
    return aperture.map(([u,v],i)=>[x+u*w,y+v*h,z+v*.20+ridge*Math.cos(i*1.9)])
  }
  const loops=[
    hoodRing(.015,.018,-.387,1.237,-.112), hoodRing(.18,.23,-.345,1.300,-.147),
    hoodRing(.38,.39,-.247,1.352,-.158), hoodRing(.63,.61,-.138,1.339,-.144,.009),
    hoodRing(.91,.91,-.052,1.262,-.115,.012), hoodRing(1.13,1.12,-.019,1.185,-.063,.012),
    hoodRing(1.21,1.19,-.011,1.142,.015,.007), hoodRing(1.15,1.14,-.003,1.110,.129,.006),
    hoodRing(1.03,1.04,0,1.094,.204), hoodRing(.985,1.002,0,1.093,.213),
    hoodRing(.910,.921,0,1.091,.213), hoodRing(.886,.901,0,1.091,.185),
    hoodRing(.82,.844,0,1.090,.165), hoodRing(.01,.01,0,1.090,.145)]
  const hues=['#572271','#682487','#742094','#8126a8','#8c2db4','#9b33bd','#9330b6',
    '#8228a7','#c68234','#ffca58','#aa6427','#472138',voidBlack]
  for (let i=0;i<hues.length;i++) add(hood,rings([loops[i],loops[i+1]],false),hues[i])
  add(hood,rings([loops[13],hoodRing(.001,.001,0,1.09,.141)]),voidBlack)
  for (const side of [-1,1]) {
    const eye=s.layer('eyes',true)
    const slit=[[.033,-.017],[.061,-.018],[.101,-.009],[.159,.032],[.144,-.006],
      [.122,-.033],[.092,-.045],[.063,-.041]]
    const shape=(f:number)=>leaf(slit.map(([x,y])=>[side*(.092+(x-.092)*f),-.014+(y+.014)*f]),.005)
    add(eye,shape(1),'#fc8022',[0,1.096,.185])
    add(eye,shape(.78),'#ffdb4d',[0,1.096,.193])
    add(eye,shape(.50),'#fff399',[0,1.097,.199])
    // A pair of raised seam lines visually lead into the peaked opening.
    stroke(hood,'#ae4bc3',[[side*.207,1.166,.170,.002,.002],[side*.179,1.235,.152,.007,.004],
      [side*.111,1.303,.098,.006,.004],[side*.062,1.344,.033,.002,.001]])
  }
}

function sleeves(s: Sculpture, kind: Caster, side: number) {
  const id=side<0?'L':'R', mage=kind==='mage', master=kind==='maestro'
  const y=master ? .86 : mage ? .70 : .735
  const sx=side*(master ? .193 : .161), ex=side*(master ? .316 : .245)
  const wx=side*(master ? .302 : side<0 ? .327 : .253), wy=y-(master ? .128 : side<0 ? .084 : .153)
  const wz=master ? .176 : .137
  const upper=s.layer('shoulder'+id), cuff=s.layer('elbow'+id)
  const hand=s.layer('wrist'+id)
  const cloth=master ? '#8931a9' : mage ? violet : ivory
  stroke(upper,cloth,[[sx*.91,y+.015,-.015,.076,.071],[sx*1.10,y-.012,0,.085,.081],
    [ex,y-.093,.049,.064,.066]],true)
  const bell: Section[] = [[ex*.986,y-.086,.045,.066,.065],
    [(ex+wx)/2,(y-.096+wy)/2,(.045+wz)/2,.075,.074],[wx,wy,wz,master?.095:.082,master?.094:.081]]
  stroke(cuff,cloth,bell,true)
  const mouth = bell[2], mid = bell[1]
  const lip=(f:number,wide:number): Section=>[mid[0]+(mouth[0]-mid[0])*f,mid[1]+(mouth[1]-mid[1])*f,
    mid[2]+(mouth[2]-mid[2])*f,mouth[3]*wide,mouth[4]*wide]
  stroke(cuff,master?'#cc8c51':gold,[lip(.70,.98),lip(.92,1.02),lip(1,1.01)])
  stroke(cuff,master?'#49264f':mage?plum:'#ccb391',[lip(1.01,.93),lip(1.025,.90)])
  if (master) {
    const bone='#f4c99b'
    oval(hand,bone,[wx,wy-.003,.204],[.069,.047,.064],[-.2,0,-side*.13],true)
    for (let i=0;i<4;i++) {
      const finger=s.layer('claw'+id+i)
      const u=side*(.300+(i-1.5)*.027), v=wy+.005-Math.abs(i-1.5)*.006
      const tipZ=.301-Math.abs(i-1.4)*.014, end=v-.063+(i===3?.017:0)
      stroke(finger,bone,[[u,v,.233,.017,.019],[u+side*.006,v+.006,.258,.017,.017],
        [u+side*.013,v-.016,tipZ,.014,.014],[u+side*.014,end,tipZ+.010,.008,.009],
        [u+side*.009,end-.010,tipZ+.003,.002,.002]],false,8)
      stroke(finger,'#fff0ca',[[u+side*.012,end+.010,tipZ+.020,.008,.003],
        [u+side*.014,end,tipZ+.020,.006,.002],[u+side*.009,end-.012,tipZ+.005,.001,.001]],false,6)
    }
    stroke(hand,bone,[[wx-side*.037,wy,.202,.024,.024],[wx-side*.066,wy-.006,.224,.023,.021],
      [wx-side*.083,wy-.029,.245,.015,.013],[wx-side*.083,wy-.052,.246,.002,.004]])
  } else if (side<0) {
    const hx=-.345, hy=y-.067
    oval(hand,skin,[hx+.008,hy,.150],[.052,.056,.047],[0,0,-.22],true)
    for (let i=0;i<4;i++) {
      const fy=hy+.034-i*.021
      stroke(hand,i===3?skin:peach,[[hx-.038,fy,.143,.012,.014],[hx-.036,fy+.002,.171,.015,.015],
        [hx-.011,fy+.003,.190,.014,.013],[hx+.014,fy+.007,.186,.010,.010]],false,8)
    }
    stroke(hand,peach,[[hx+.040,hy+.005,.144,.020,.020],[hx+.035,hy+.027,.168,.020,.018],
      [hx+.011,hy+.035,.184,.018,.015],[hx-.008,hy+.035,.186,.010,.012]],false,10)
  } else {
    oval(hand,skin,[wx,wy-.016,.163],[.045,.048,.032],[-.30,0,-.13],true)
    for (let i=0;i<4;i++) {
      const x=wx+(i-1.5)*.018, fy=wy-.028
      const reach=!mage && i<2 ? .029 : .005
      stroke(hand,peach,[[x,fy,.170,.010,.013],[x+.006,fy-.017,.187,.012,.013],
        [x+.006,fy-.028+.004*i,.206-i*.003+reach*.4,.010,.010],[x+.002,fy-.028+.006*i,.217-i*.006+reach,.007,.008]],false,8)
    }
    stroke(hand,peach,[[wx-.029,wy-.004,.174,.014,.014],[wx-.049,wy-.005,.188,.014,.014],
      [wx-.057,wy+.004,.202,.009,.010]],false,8)
  }
}

function staff(s: Sculpture, mage: boolean) {
  const wood=s.layer('staff'), light=s.layer('staff',true), burst=s.layer('burst',true)
  const x=-.437,y=mage?1.187:1.207,z=.160
  const shaftX=(h:number)=>-.345-.165*(h-(mage?.637:.672))
  const staffRow=(h:number,r:number): Row=>[h,r,r,shaftX(h),z]
  add(wood,loft([staffRow(.035,.011),staffRow(.052,.021),staffRow(.118,.016),
    staffRow(.57,.021),staffRow(.763,.025),staffRow(.982,.019),staffRow(1.081,.030)],14,.94),mage?'#925132':'#bc8240',
  undefined,undefined,undefined,true)
  for (const h of [.068,.104,.559,.730,1.033,1.064]) {
    const r=h<.2?.021:h<1?.025:.032
    add(wood,loft([staffRow(h-.008,r),staffRow(h,r+.002),staffRow(h+.010,r)],14),gold)
  }
  for(let i=0;i<4;i++) {
    const h=.580+i*.035
    add(wood,loft([staffRow(h,.025),staffRow(h+.011,.025)],14,1,0,a=>.006*Math.sin(a)),mage?'#5c3530':brass)
  }
  if (mage) {
    for (const side of [-1,1]) stroke(wood,side<0?'#ad6935':'#8e492e',
      [[x,1.052,z,.029,.030],[x+side*.036,1.083,z-.003,.029,.026],[x+side*.065,1.124,z,.022,.022],
        [x+side*.067,1.160,z+.004,.017,.017],[x+side*.052,1.198,z+.008,.003,.004]],true)
    const crystal=loft([[1.086,.003,.005,x,z],[1.145,.050,.044,x-.002,z],
      [1.194,.061,.052,x-.007,z],[1.264,.021,.020,x-.014,z],[1.303,.001,.001,x-.031,z]],6,.94)
    // Flat normals keep a glass-like bright plane beside the ruby-red planes.
    const faceted=crystal.toNonIndexed()
    faceted.computeVertexNormals()
    add(wood,faceted,'#f1483d',undefined,undefined,undefined,true)
    add(light,leaf([[0,-.058],[.019,-.013],[.008,.055],[-.015,.010]],.002),
      '#ff9966',[x-.008,y+.004,z+.048],[1,1,1],[0,-.12,.16])
  } else {
    add(wood,rim,gold,[x,y,z],[.102,.102,.098],undefined,true)
    add(wood,rim,gilt,[x,y,z+.006],[.077,.077,.071])
    for (let i=0;i<8;i++) {
      const a=tau*i/8, len=i%2?.034:.048
      const ray=leaf([[-.015,-.007],[.006,-.003],[.014,.009],[.012,len*.58],[.021,len],
        [.001,len*.70],[-.012,.018]],.009)
      add(wood,ray,i%2?gold:gilt,[x+.101*Math.sin(a),y+.101*Math.cos(a),z],[1,1,1],[0,0,-a])
    }
    oval(light,'#ffd15a',[x,y,z],[.051,.054,.028])
    oval(light,'#fff5ac',[x-.007,y+.007,z+.012],[.038,.040,.026])
    add(light,star,'#fffde2',[x-.011,y+.012,z+.040],[.022,.028,.012])
  }
  for(let i=0;i<9;i++) {
    const a=tau*i/9, d=.105+(i%3)*.026
    add(burst,star,mage?(i%2?'#ffbb58':'#ff7954'):(i%2?gilt:'#fff6b2'),
      [x+Math.cos(a)*d,y+Math.sin(a)*d,z+.025+(i%2)*.028],[.010+i%3*.004,.020+i%3*.006,.015],[0,0,a-.5])
  }
  if(!mage) {
    const motes=s.layer('blessing',true)
    for (const [dx,dz,k] of [[-.040,.069,.014],[.004,.095,.023],[.044,.060,.011],[.020,.035,.009]]) {
      add(motes,star,'#ffeb92',[.250+dx,.534,.228+dz],[k,k*1.3,.011],[-1.2,0,.1])
    }
  }
}

const patterns: Partial<Record<Caster,ReturnType<typeof finish>>> = {}
function pattern(kind: Caster) {
  if (patterns[kind]) return patterns[kind]
  const s=foundation(kind)
  if (kind==='maestro') overlord(s)
  else {
    const mage=kind==='mage'
    boots(s)
    vestments(s,mage)
    face(s,mage)
    if (mage) wizardFinery(s)
    else priestHair(s)
    staff(s,mage)
  }
  sleeves(s,kind,-1)
  sleeves(s,kind,1)
  return patterns[kind]=finish(s)
}

// Two-link reach in chest space. Guide the elbow outside the costume and orient
// the palm separately, so the fingers can actually contact a beard or one another.
function armReach(upper: Bone, elbow: Bone, wrist: Bone) {
  const upperRest=elbow.position.clone().normalize(), lowerRest=wrist.position.clone().normalize()
  const a=elbow.position.length(), b=wrist.position.length()
  const dir=new Vector3(), bend=new Vector3(), forearm=new Vector3()
  const shoulderQ=new Quaternion(), elbowQ=new Quaternion(), wristQ=new Quaternion(), angles=new Euler()
  return (weight:number, x:number,y:number,z:number, side:number, rx:number,ry:number,rz:number)=>{
    if(weight<=0) return
    const distance=Math.min(a+b-.00001,Math.max(Math.abs(a-b)+.00001,dir.set(x,y,z).length()))
    dir.normalize()
    bend.set(side,-.58,-.34)
    bend.addScaledVector(dir,-bend.dot(dir)).normalize()
    const along=(a*a-b*b+distance*distance)/(2*distance)
    bend.multiplyScalar(Math.sqrt(Math.max(0,a*a-along*along))).addScaledVector(dir,along)
    forearm.copy(dir).multiplyScalar(distance).sub(bend).normalize()
    shoulderQ.setFromUnitVectors(upperRest,bend.normalize())
    forearm.applyQuaternion(wristQ.copy(shoulderQ).invert())
    elbowQ.setFromUnitVectors(lowerRest,forearm)
    wristQ.multiplyQuaternions(shoulderQ,elbowQ).invert()
    wristQ.multiply(anglesToQuaternion.setFromEuler(angles.set(rx,ry,rz)))
    upper.quaternion.slerp(shoulderQ,weight)
    elbow.quaternion.slerp(elbowQ,weight)
    wrist.quaternion.slerp(wristQ,weight)
  }
}
const anglesToQuaternion=new Quaternion()

function makeActor(kind: Caster) {
  const {pivots,geometry}=pattern(kind)
  const root=new Group(), bones: Record<string,Bone>={}, offsets: Record<string,V3>={}
  for (const {name,parent,at} of pivots) {
    const bone=new Bone()
    bone.name=name
    bone.position.fromArray(at)
    if (parent) {
      const [x,y,z]=offsets[parent]
      bone.position.x-=x
      bone.position.y-=y
      bone.position.z-=z
    }
    bones[name]=bone
    offsets[name]=at
    const anchor=parent ? bones[parent] : root
    anchor.add(bone)
  }
  root.updateMatrixWorld(true)
  const skeleton=new Skeleton(Object.values(bones))
  const glow=new MeshBasicMaterial({vertexColors:true,toneMapped:false})
  const materials=[toon,ink,glow]
  for (let i=0;i<geometry.length;i++) {
    const mesh=new SkinnedMesh(geometry[i],materials[i])
    mesh.bind(skeleton)
    mesh.frustumCulled=false
    root.add(mesh)
  }
  const halo=kind==='maestro' ? null : new Sprite(lightHalo)
  if (halo) {
    bones.staff.add(halo)
    const tip=offsets.burst, hand=offsets.staff
    halo.position.set(tip[0]-hand[0],tip[1]-hand[1],tip[2]-hand[2]+.01)
  }
  const claws=kind==='maestro' ? pivots.filter(p=>p.name.startsWith('claw')).map(p=>bones[p.name]) : []
  const reachL=armReach(bones.shoulderL,bones.elbowL,bones.wristL)
  const reachR=armReach(bones.shoulderR,bones.elbowR,bones.wristR)
  return {root,bones,claws,skeleton,glow,halo,reachL,reachR}
}
type Actor=ReturnType<typeof makeActor>
function ease(t:number,a:number,b:number) {
  const u=Math.max(0,Math.min(1,(t-a)/(b-a)))
  return u*u*(3-2*u)
}
function phrase(t:number,start:number,peak:number,release:number,end:number) {
  return ease(t,start,peak)*(1-ease(t,release,end))
}
function animateHero(actor: Actor, mage: boolean, pose: MenuPose) {
  const b=actor.bones, idle=pose.anim==='idle' ? pose.t%8 : 0
  const cheer=pose.anim==='cheer' ? pose.t : 0, a=tau*idle/8
  const breath=Math.sin(a*2), sway=Math.sin(a)
  const sign=phrase(idle,3.15,3.91,4.52,5.23), strokeBeard=sign*Math.sin((idle-3.9)*8)
  const prep=phrase(cheer,0,.16,.18,.38), lift=phrase(cheer,.16,.55,.92,1.6)
  const spark=phrase(cheer,.38,.59,.67,1.14), laugh=lift*Math.sin((cheer-.45)*20)
  const blink=phrase(idle,2.10,2.180,2.200,2.31)+phrase(idle,6.78,6.87,6.89,7.01)
  b.spine.position.x=(mage?-.024:.008)+.006*sway
  b.spine.rotation.set((mage?.092:-.025)+.017*breath+.08*prep-.11*lift,
    (mage?-.066:.085)+.037*sway+(mage?.14:-.10)*lift,(mage?.088:-.058)+.018*sway-.07*lift)
  b.chest.scale.set(1+.006*breath,1+.013*breath,1+.022*breath)
  b.chest.rotation.x=.012*breath+(mage?.060*laugh:0)
  b.neck.rotation.set(.006*breath+.050*prep-(mage?.20:.14)*lift,
    .16+.064*Math.sin(a+.29)+(mage?-.18:.16)*sign,(mage?-.077:.075)+.022*sway)
  b.head.rotation.set((mage?.040:-.025)+.015*Math.sin(2*a+.43)+.058*sign,0,
    (mage?-.055:.042)*sign-(mage?.075:.10)*lift)
  b.eyes.scale.y=(mage?.85:1)*(1-.95*blink)*(1-(mage?.48:.15)*lift)
  b.hem.rotation.set(.021*breath+.025*lift,.025*sway+.047*lift,-.024*sway)
  b.train.rotation.set(.042+.033*Math.sin(2*a-.54)+.14*lift, .036*sway,-.023*sway)
  b.mane.rotation.set(.027*Math.sin(2*a-.65)+.066*lift, .047*sway, .029*Math.sin(a-.55)-.056*sign)
  b.beard.rotation.set(-.038+.035*Math.sin(2*a-.45)-.13*sign-.095*lift+.046*laugh,.050*sway,.053*sign)
  b.tip.rotation.set(.042*Math.sin(2*a-.51),.028*sway,.095*Math.sin(a-.52)+.13*prep-.16*lift+.10*laugh)

  // Staff arm: shoulder takes the weight, elbow leads the lift, wrist keeps
  // the long staff upright as the elbow arcs out from the body.
  b.shoulderL.rotation.set(mage?.10:-.05,-.015+.020*sway,(mage?.06:-.06)+.015*breath+.17*prep-(mage?.64:.99)*lift)
  b.elbowL.rotation.set(-.08-.09*lift,.030*sway,-.12-(mage?.27:.40)*lift)
  b.wristL.rotation.set(-.02-.060*lift,0,.08+.21*lift)
  b.staff.rotation.set(.024+(mage?.012:0)*breath,0,(mage?-.10:.02)-.12*prep+(mage?.65:1.02)*lift)
  if (mage) {
    b.shoulderR.rotation.set(-.10-.45*sign-.43*lift,-.26-1.05*sign+.22*lift,.10-.11*sign+.62*lift)
    b.elbowR.rotation.set(-.31-.86*sign+.10*strokeBeard-.72*lift,-.18-.29*sign,-.12-.19*sign)
    b.wristR.rotation.set(-.18-.16*sign-.12*strokeBeard,-.15-.32*sign,.23+.19*sign)
    actor.reachR(sign,-.048,.036+.014*strokeBeard,.205,1,-1.04,-.62,-.28)
  } else {
    b.shoulderR.rotation.set(-.02-.62*sign-.31*lift,-.16-.17*sign,.13+.29*sign+.26*lift)
    b.elbowR.rotation.set(-.17-.87*sign-.39*lift,-.05-.22*sign,.13+.17*sign)
    b.wristR.rotation.set(-.09-.54*sign,-.14+.25*sign,.15+.40*sign)
    actor.reachR(sign,.105,.039,.153,1,-1.19,-.13,.20)
    b.blessing.scale.setScalar(sign*(.89+.11*Math.sin(a*12)))
  }
  b.burst.scale.setScalar(spark*(.70+ease(cheer,.38,.98)*.66))
  b.burst.rotation.z=spark*.36
  actor.glow.color.setScalar((mage?.97:1.06)+.065*breath+.34*spark)
  actor.halo!.scale.setScalar((mage?.125:.181)+.019*breath+(mage?.19:.30)*spark)
}

function animateMaster(actor: Actor, pose: MenuPose) {
  const b=actor.bones, idle=pose.anim==='idle' ? pose.t%8 : 0, a=tau*idle/8
  const cheer=pose.anim==='cheer' ? pose.t : 0
  const hover=Math.sin(2*a), drift=Math.sin(a), plot=phrase(idle,3.02,3.95,4.64,5.50)
  const gather=phrase(cheer,0,.21,.23,.49), spread=phrase(cheer,.20,.57,.94,1.6)
  const blink=phrase(idle,2.32,2.42,2.45,2.58)+phrase(idle,6.68,6.78,6.82,6.95)
  b.hips.position.set(.012*drift,.45+.036*hover-.036*gather+.065*spread,0)
  b.spine.rotation.set(.054+.017*hover+.14*gather-.114*spread,.032*drift,.028*Math.sin(a+.42))
  b.chest.scale.set(1+.012*hover,1+.015*hover,1+.017*hover)
  b.neck.rotation.set(.028+.031*Math.sin(2*a-.64)+.081*plot-.10*spread,.15+.089*drift,-.046+.028*Math.sin(a+.22))
  b.head.rotation.z=.062*plot
  b.head.scale.set(1.10,1.02,1.02)
  b.eyes.scale.set(1+.10*spread,1-.89*blink-.20*plot+.31*spread,1)
  actor.glow.color.setScalar(1+.08*hover+.66*spread)
  b.hem.rotation.set(.048*Math.sin(2*a-.95)+.13*spread,.106*Math.sin(a-.74)-.11*gather+.19*spread,.056*drift)
  b.hem.scale.set(1+.038*hover+.20*spread,1-.055*spread,1+.045*hover+.20*spread)
  b.train.rotation.set(.051*Math.sin(2*a-.80)+.25*spread,.079*drift,-.048*drift)
  b.tip.rotation.z=.045*Math.sin(2*a-.66)-.09*spread
  for (let i=0;i<2;i++) {
    const side=i===0?-1:1, wave=Math.sin(2*a+side*.57)
    const upper=i===0?b.shoulderL:b.shoulderR, elbow=i===0?b.elbowL:b.elbowR, wrist=i===0?b.wristL:b.wristR
    upper.rotation.set(-.14+.085*wave-.38*plot-.29*gather-.38*spread,
      side*(-.22+.037*drift-1.08*plot-.62*gather+.56*spread),side*(.12+.035*wave+.74*spread))
    elbow.rotation.set(-.23-.062*wave-.30*plot-.23*gather+.13*spread,side*(-.19-.28*plot),side*.09*spread)
    wrist.rotation.set(.27+.089*wave-.52*plot+.22*spread,side*(-.16+.16*plot),side*(.17+.66*plot-.40*spread))
    const reach=i===0?actor.reachL:actor.reachR
    reach(plot,-side*.092,-.028,.204,side,-.84,-side*.65,side*.12)
    for (let j=0;j<4;j++) {
      actor.claws[i*4+j].rotation.set(.14+.18*Math.sin(3*a+j*.83+i)-.25*plot-.31*spread,
        side*(j-1.5)*(.032+.079*spread),0)
    }
  }
}

function MenuCaster({kind,pose}: Props & {kind:Caster}) {
  const actor=useMemo(()=>makeActor(kind),[kind])
  useEffect(()=>()=>{actor.skeleton.dispose(); actor.glow.dispose()},[actor])
  useFrame(()=>{
    if (kind==='maestro') animateMaster(actor,pose)
    else animateHero(actor,kind==='mage',pose)
  })
  return <group name={'HD '+kind} scale={kind==='priestess'?.895:kind==='mage'?.935:1.025} dispose={null}>
    <BlobShadow radius={kind==='maestro'?.33:.293} />
    <primitive object={actor.root} />
  </group>
}
export function HdPriestess({pose}: Props) { return <MenuCaster kind="priestess" pose={pose} /> }
export function HdMage({pose}: Props) { return <MenuCaster kind="mage" pose={pose} /> }
export function HdMaestro({pose}: Props) { return <MenuCaster kind="maestro" pose={pose} /> }
