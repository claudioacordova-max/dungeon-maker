import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide, Bone, BufferGeometry, CatmullRomCurve3, Color, Euler, Float32BufferAttribute, Group,
  MeshBasicMaterial, Quaternion, Skeleton, SkinnedMesh, SphereGeometry, Sprite, TorusGeometry,
  TubeGeometry, Uint16BufferAttribute, Vector3, type Camera,
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
const sphere = new SphereGeometry(1, 12, 8)
const bead = new SphereGeometry(1, 8, 5)
const rim = new TorusGeometry(1, .095, 6, 32)
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
  lift?: (angle: number, row: number) => number, closed = true) {
  return rings(rows.map(([y,rx,rz,x=0,z=0], j) => Array.from({ length: segments }, (_,i): V3 => {
    const a = tau*i/segments, u = Math.sin(a), v = Math.cos(a)
    const fold = 1 + ripple*(1-j/(rows.length-1))*(Math.cos(7*a+.4)+.35*Math.cos(3*a))
    return [x+rx*fold*Math.sign(u)*Math.abs(u)**shape, y+(lift?.(a,j) ?? 0),
      z+rz*fold*Math.sign(v)*Math.abs(v)**shape]
  })),closed)
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
function stroke(layer: Layer, c: string, points: Section[], outline = false, segments = 10) {
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
  if (mage) s.pivot('mouth','head',[.013,.866,.237])
  s.pivot('tip','head',[0,mage ? 1.27 : 1.30,0])
  if (master) s.pivot('wisp','chest',[0,.875,.262])
  for (const side of [-1,1]) {
    const id = side < 0 ? 'L' : 'R'
    if (!master) s.pivot('brow'+id,'head',[side*.043,eye+.050,.180])
    if (mage) s.pivot('whisker'+id,'head',[side*.012,.892,.222])
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
  if (!master) s.pivot('lantern','staff',[-.437,mage ? 1.187 : 1.207,.16])
  s.pivot('blessing','wristR',[.250,.558,.228])
  return s
}

function boots(s: Sculpture, mage: boolean) {
  for (const side of [-1,1]) {
    const layer = s.layer(side<0 ? 'legL' : 'legR')
    const x = side*.132, z = (side<0 ? -.055 : .010)-(mage?.067:0)
    const foot = (rows: Row[]) => loft(rows,20,.76)
    add(layer,foot([[.003,.082,.114,x,z+.031],[.017,.091,.122,x,z+.037],[.037,.092,.120,x,z+.036]]),'#583846')
    add(layer,foot([[.028,.09,.120,x,z+.035],[.062,.092,.122,x,z+.036],
      [.097,.088,.117,x,z+.029],[.129,.073,.077,x,z],[.235,.062,.069,x,z]]),'#9c6244',undefined,undefined,undefined,true)
    add(layer,foot([[.103,.077,.087,x,z+.004],[.126,.078,.081,x,z]]),'#774639')
    add(layer,foot([[.075,.088,.120,x,z+.032],[.083,.089,.119,x,z+.032],
      [.098,.087,.117,x,z+.030]]),'#795046')
    add(layer,jewel,brass,[x,.091,z+.150],[.032,.021,.012],[-.33,0,0])
    add(layer,jewel,gilt,[x,.093,z+.155],[.026,.015,.010],[-.33,0,0])
  }
}

function vestments(s: Sculpture, mage: boolean) {
  const main = mage ? violet : ivory
  const lower = s.layer('hips',false,{to:'hem',low:.48,high:.18})
  // The outer wrap lifts over the forward knee. Its deeper lining is visible
  // in the notch, which keeps both feet readable beneath the robe.
  const fall = (a: number) => .018*Math.cos(3*a+.25)-.016*Math.cos(a)
    +(mage?.07:.105)*Math.max(0,Math.cos(a-.59))**5
  const skirt: Row[] = [[.137,.258,.184],[.133,.273,.196],[.151,.278,.199],[.157,.277,.198],[.211,.266,.186],
    [.337,.209,.150,.008],[.47,.150,.118,.014],[.496,.150,.116,.012]]
  add(lower,loft([[.136,.252,.180],[.157,.265,.184],[.287,.213,.147],[.408,.168,.130]],
    32,.90,.065,(a,j)=>.016*Math.sin(4*a)*(1-j/3)),mage?'#412951':'#7acac2',undefined,undefined,undefined,true)
  // Colour contiguous rows of the same cloth. A separate capped band across
  // a scooped opening would cut a diagonal plate through the pleats.
  const cloth=loft(skirt,48,.92,.065,(a,j)=>fall(a)*Math.min(1,(7-j)/4),false).toNonIndexed()
  const colors=[], dye=new Color(), vertices=cloth.getAttribute('position')
  for (let i=0;i<vertices.count;i++) {
    const band=Math.floor(i/(6*48)), flute=Math.atan2(vertices.getX(i),vertices.getZ(i)*1.38)
    dye.set(band===0?brass:band===1?gold:band===2?gilt:main)
    const shade=.83+.17*Math.cos(7*flute+.4)
    colors.push(dye.r*shade,dye.g*shade,dye.b*(.45+.55*shade))
  }
  cloth.setAttribute('color',new Float32BufferAttribute(colors,3))
  add(lower,cloth,'#ffffff',undefined,undefined,undefined,true)
  // Split stole: a broad coloured silk panel, piped on both sides.
  const panel: Section[] = [[.016,.484,.129,.058,.010],[.008,.398,.152,.061,.012],
    [-.006,.310,.180,.066,.014],[-.028,.235,.203,.065,.014],[-.041,.180,.212,.005,.006]]
  stroke(lower,gold,panel)
  stroke(lower,mage ? '#39677f' : teal,panel.map(([x,y,z,w,d])=>[x,y+.005,z+.006,w*.83,d]))
  add(lower,star,gilt,[-.023,.258,.226],[.028,.040,.014],[.18,0,-.14])
  const top = s.layer('hips',false,{to:'chest',low:.494,high:.68})
  add(top,loft([[.451,.148,.115,.014],[.50,.151,.116,.012],[.63,.192,.134],[.70,.207,.132],
    [.738,.15,.116],[.77,.086,.087]],24,.87),main,undefined,undefined,undefined,true)
  const belt = s.layer('hips')
  add(belt,loft([[.439,.157,.126,.014],[.453,.160,.128,.015],[.501,.158,.124,.012]],28,.89,0,a=>.009*Math.sin(a)),
    mage ? '#75503c' : teal)
  add(belt,loft([[.483,.160,.126,.013],[.498,.159,.127,.012]],28,.89,0,a=>.009*Math.sin(a)),mage ? brass : jade)
  brooch(belt,[.041,.473,.135],.038,mage ? '#da5940' : jade)
  const pouch = s.layer('hips')
  oval(pouch,'#915031',[.155,.398,.068],[.061,.066,.037],[0,.52,-.17],true)
  oval(pouch,'#b37145',[.158,.420,.085],[.059,.039,.029],[0,.52,-.17])
  add(pouch,bead,gilt,[.173,.411,.112],[.012,.014,.006])
  stroke(pouch,'#744835',[[.130,.492,.087,.013,.008],[.148,.464,.099,.014,.008],[.160,.438,.087,.014,.007]],false,8)
  if (mage) {
    // Rolled spell on the belt, with a dark opening at the raised end.
    const roll: Section[]=[[.174,.383,.038,.031,.029],[.185,.441,.057,.030,.028],[.204,.492,.076,.033,.032]]
    stroke(pouch,'#e7c694',roll,true,10)
    stroke(pouch,'#925634',[[.181,.424,.052,.032,.030],[.187,.445,.059,.032,.030]],false,10)
    stroke(pouch,'#976348',[[.203,.492,.076,.021,.018],[.205,.495,.077,.019,.016]],false,10)
  }
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
  if (!mage) {
    const sash=s.layer('hips',false,{to:'chest',low:.494,high:.68})
    const silk: Section[]=[[.136,.746,.091,.032,.014],[.111,.712,.146,.041,.013],
      [.067,.676,.171,.043,.014],[.021,.632,.175,.046,.014],[-.029,.589,.156,.045,.012],
      [-.069,.546,.132,.044,.012],[-.099,.498,.101,.039,.009]]
    stroke(sash,'#17898c',silk)
    stroke(sash,teal,silk.map(([x,y,z,w,d])=>[x,y,z+.004,w*.87,d]))
    brooch(mantle,[.068,.676,.189],.024,jade)
  } else brooch(mantle,[.108,.700,.135],.024,'#db6564')
  if (!mage) {
    for(const side of [-1,1]) for(let i=0;i<3;i++)
      add(mantle,jewel,'#dfb569',[side*(.119+i*.028),.683+i*.008,.142-i*.018],[.011,.022,.006],
        [-.22,side*.48,side*(-.68+.08*i)])
  }
}

const eyeShape = leaf([[-1,.05],[-.85,.52],[-.50,.84],[-.10,.94],[.36,.93],[.74,.70],[1,.20],
  [.89,-.18],[.61,-.54],[.20,-.74],[-.24,-.77],[-.69,-.52]],.13)

function face(s: Sculpture, mage: boolean) {
  const h = s.layer('head'), eyes = s.layer('eyes'), y = mage ? .977 : 1.058
  const catchlights = s.layer('eyes',true)
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
    const x=side*.090, yaw=side*.38
    const tilt: V3=[-.017,yaw,side*(mage ? .18 : .105)]
    const eyeHeight=mage ? (side<0?.035:.045) : .047
    add(eyes,eyeShape,'#392332',[x,y,.174],[.077,eyeHeight*1.12,.059],tilt)
    add(eyes,eyeShape,'#fff5e2',[x,y-.004,.177],[.068,eyeHeight*.91,.060],tilt)
    const gaze=x+(mage?.014:.009)
    oval(eyes,'#352637',[gaze,y,.188],[.036,eyeHeight*.89,.012],tilt)
    oval(eyes,mage ? '#d99634' : '#389887',[gaze,y-.004,.195],[.031,eyeHeight*.74,.009],tilt)
    oval(eyes,'#241b30',[gaze+.001,y+.003,.202],[.020,eyeHeight*.53,.007],tilt)
    add(catchlights,bead,'#fff8df',[gaze-.009,y+.015,.213],[.012,.012,.005],tilt)
    add(catchlights,bead,mage?'#ffc564':'#96f0d6',[gaze+.010,y-.017,.206],[.006,.005,.003],tilt)
    const brow = mage ? wool : '#965b31'
    const arch=side>0 ? .012 : -.004
    const eyebrow=s.layer(side<0?'browL':'browR')
    stroke(eyebrow,brow,[[side*.030,y+(mage?.037:.062)+arch,.185,.011,.011],
      [side*.065,y+(mage?.048:.075)+arch,.184,.021,.018],
      [side*.119,y+(mage?.074:.077)+arch,.165,.021,.015],[side*.167,y+(mage?.089:.052)+arch,.132,.003,.003]],mage)
    if (mage) {
      stroke(eyebrow,grey,[[side*.063,y+.039,.179,.005,.005],[side*.100,y+.047,.177,.014,.012],
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
    // The crescent hugs the muzzle; its near corner lifts into the cheek.
    const smile=s.layer('head')
    stroke(smile,'#763a41',[[-.053,y-.098,.160,.002,.003],[-.031,y-.107,.172,.006,.005],
      [.004,y-.111,.177,.012,.006],[.036,y-.104,.170,.008,.005],[.061,y-.085,.156,.002,.002]])
    stroke(smile,'#fff0db',[[-.031,y-.103,.175,.001,.002],[.001,y-.106,.183,.004,.002],
      [.026,y-.103,.180,.004,.002],[.047,y-.097,.170,.001,.002]],false,6)
    stroke(smile,'#f6a18c',[[-.019,y-.121,.169,.002,.003],[.010,y-.126,.172,.006,.004],[.040,y-.114,.165,.002,.002]])
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
    if (side<0) {
      const locks: Section[] = [[-.153,1.191,.069,.054,.044],[-.202,1.102,.092,.055,.040],
        [-.198,.984,.108,.049,.042],[-.207,.904,.143,.052,.040],
        [-.255,.817,.124,.040,.032],[-.278,.797,.086,.021,.018],[-.289,.820,.066,.002,.002]]
      stroke(hair,blonde,locks,true,12)
      stroke(hair,flax,locks.map(([x,y,z,w,d])=>[x+.013,y,z+d*.78,w*.35,d*.29]))
    }
    stroke(hair,'#d58b3d',[[side*.169,1.13,-.103,.061,.048],[side*.213,.957,-.107,.059,.046],
      [side*.204,.807,-.067,.055,.045],[side*.260,.686,-.052,.039,.036],[side*.275,.646,-.038,.002,.002]])
  }
  // The temple is swept back over the ear. Alternating overhand sections
  // bring the heavy plait forward onto the near shoulder.
  stroke(hair,blonde,[[.116,1.204,.120,.029,.029],[.174,1.147,.118,.048,.040],
    [.198,1.076,.070,.052,.042],[.210,1.012,.021,.046,.040],[.214,.970,.065,.033,.032]],true)
  for(let i=0;i<5;i++) {
    const x=.214+.009*i, y=.999-i*.048, z=.058+.014*i, side=i%2 ? -1 : 1
    stroke(hair,i%2 ? '#f3b14e' : flax,[[x-side*.019,y+.024,z-.014,.023,.026],
      [x+side*.019,y+.002,z+.002,.041,.034],[x+side*.017,y-.018,z+.020,.039,.028],
      [x-side*.024,y-.052,z+.017,.012,.020]],false,10)
    stroke(hair,i%2 ? '#d78c45' : '#ffdf8e',[[x+side*.035,y+.009,z+.016,.002,.002],
      [x+side*.033,y-.013,z+.045,.006,.004],[x+side*.015,y-.029,z+.044,.007,.004],
      [x-side*.014,y-.047,z+.037,.001,.002]],false,6)
  }
  add(hair,loft([[.745,.032,.030,.248,.132],[.769,.035,.032,.248,.129]],12),teal)
  add(hair,loft([[.749,.034,.032,.248,.132],[.756,.035,.032,.248,.132]],12),gilt)
  stroke(hair,blonde,[[.250,.746,.133,.021,.019],[.259,.714,.148,.034,.029],
    [.282,.683,.147,.025,.019],[.303,.678,.131,.003,.003]])
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
    const x=i*.059, a=Math.abs(i), y=.582+a*.049
    stroke(beard,i%2===0 ? wool : '#dad2d8',[[x,.894-a*.004,.179-a*.017,.054,.039],
      [x*.99-.011,.813,.228-a*.017,.059,.045],[x*.91-.011,.736+a*.018,.246-a*.017,.048,.033],
      [x*1.03+.021,y+.033,.249-a*.014,.030,.023],[x*1.08+.055,y+.008,.227-a*.015,.012,.010],
      [x*1.09+.061,y+.027,.216-a*.015,.002,.002]])
  }
  const mouth=s.layer('mouth')
  oval(mouth,'#692f3f',[.013,.858,.237],[.052,.025,.021],[0,0,.14])
  stroke(mouth,'#fff0d8',[[-.027,.864,.250,.001,.001],[.002,.869,.258,.006,.004],
    [.028,.871,.254,.006,.003],[.049,.873,.247,.001,.002]],false,8)
  stroke(mouth,'#f69c92',[[-.014,.845,.250,.002,.003],[.009,.844,.256,.005,.004],[.035,.852,.251,.002,.002]],false,6)
  for (const side of [-1,1]) {
    const curl=side>0?.021:0
    stroke(s.layer(side<0?'whiskerL':'whiskerR'),wool,[[side*.006,.891,.224,.019,.019],[side*.048,.900,.232,.033,.030],
      [side*.102,.884+curl,.224,.030,.031],[side*.158,.875+curl,.201,.024,.023],
      [side*.191,.895+curl,.174,.017,.018],[side*.202,.933+curl,.158,.002,.002]],true)
  }
  oval(head,'#efad87',[0,.924,.208],[.056,.041,.047],[-.04,0,-.07])
  const wave=(a:number)=>.034*Math.sin(a)+.032*Math.cos(2*a+.7)-.014*Math.cos(a)
  add(head,loft([[1.086,.309,.227],[1.091,.327,.239],[1.108,.335,.247],
    [1.122,.305,.227],[1.137,.217,.167]],40,.95,0,(a,j)=>wave(a)*(1-j*.13)),'#654099',undefined,undefined,undefined,true)
  add(head,loft([[1.097,.333,.244],[1.104,.337,.248]],40,.95,0,a=>wave(a)*.79),'#aa70c4')
  const hat=s.layer('head',false,{to:'tip',low:1.192,high:1.268})
  stroke(hat,'#7547ac',[[0,1.106,0,.225,.178],[0,1.161,0,.218,.175],
    [.006,1.240,-.004,.171,.142],[.035,1.305,-.010,.126,.110],
    [.094,1.351,-.015,.090,.080],[.165,1.376,-.010,.059,.056],
    [.225,1.359,.001,.041,.039],[.257,1.312,.018,.024,.023],[.267,1.278,.023,.009,.010]],true,18)
  add(head,loft([[1.126,.240,.190,-.004],[1.139,.240,.191,-.005],[1.183,.222,.182,-.004],
    [1.190,.215,.178,-.004]],36,.98,0,a=>.010*Math.sin(a-.7)),gold)
  add(head,loft([[1.170,.230,.185,-.004],[1.182,.225,.184,-.004]],36,.98,0,a=>.010*Math.sin(a-.7)),gilt)
  brooch(head,[-.064,1.150,.181],.031,teal)
  line(hat,'#e0ab93',[[-.070,1.228,.149],[-.035,1.241,.147],[.065,1.274,.123]],.003)
  for (const [x,y,z,size] of [[-.072,1.229,.150,.023],[.067,1.274,.122,.026],[.099,1.313,.085,.012]]) {
    add(hat,star,'#f7d593',[x,y,z],[size,size*1.25,.014],[.33,x*2,-.18])
  }
  stroke(hat,'#9761b4',[[-.152,1.191,.108,.002,.003],[-.121,1.242,.109,.009,.005],
    [-.077,1.294,.083,.011,.005],[-.008,1.340,.065,.005,.003],[.045,1.360,.048,.001,.002]],false,8)
  const tassel=s.layer('tip')
  add(tassel,bead,gilt,[.267,1.279,.023],[.018,.015,.015])
  add(tassel,star,gold,[.268,1.245,.024],[.038,.033,.026],[0,0,-.14])
}

function overlord(s: Sculpture) {
  const skirt=s.layer('spine',false,{to:'hem',low:.66,high:.23})
  const tear=(a:number)=>.068*Math.cos(7*a+.36)+.032*Math.sin(3*a+.6)+.038*Math.sin(a)
  const folds=loft([[.235,.281,.192,.057,-.043],[.250,.280,.193,.050,-.041],[.320,.246,.180,.026,-.024],[.453,.204,.159],
    [.620,.156,.122],[.710,.168,.124],[.816,.201,.138],[.878,.196,.125]],54,.94,.092,
  (a,j)=>tear(a)*Math.max(0,1-Math.max(0,j-1)*.45))
  const pigment=[], dye=new Color()
  for(let i=0;i<folds.getAttribute('position').count;i++){
    const row=Math.floor(i/54), a=i%54*tau/54
    dye.set(row===0?'#c777cf':row===1?'#903aab':row<4?'#662985':'#8234a4')
    const pleat=.75+.25*Math.cos(7*a+.4)
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
  add(cape,loft([[.272,.300,.063,.106,-.221],[.365,.250,.075,.061,-.178],
    [.643,.180,.092,0,-.088],[.830,.217,.118,0,-.042],[.892,.156,.106,0,-.027]],
  48,.9,.08,(a,j)=>tear(a)*(1-j/4)),'#4b205f',undefined,undefined,undefined,true)
  const chest = s.layer('chest')
  const dip=(a:number)=>-.072*Math.cos(a)**4
  add(chest,loft([[.801,.245,.171],[.826,.254,.181],[.875,.203,.152],[.905,.147,.112]],36,.88,0,
    (a,j)=>dip(a)*(1-j/3)),'#972fb5',undefined,undefined,undefined,true)
  add(chest,loft([[.798,.247,.174],[.809,.250,.178]],36,.88,0,dip),'#d38a3f')
  brooch(chest,[0,.805,.190],.047,'#fc9937')
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
    hoodRing(.015,.018,-.439,1.246,-.038), hoodRing(.18,.23,-.374,1.300,-.083),
    hoodRing(.38,.39,-.262,1.367,-.120), hoodRing(.63,.61,-.138,1.339,-.144,.009),
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
    // A high standing collar frames the mask. Each satin facing folds back
    // to reveal a wine-coloured lining and a pointed gold-bound lapel.
    const points=[[-.103,-.054],[-.059,-.071],[.006,-.037],[.078,.045],[.138,.128],[.054,.105],[-.035,.064]]
    const facing=leaf(points.map(([x,y])=>[side*x,y]),.022)
    add(chest,facing,'#602866',[side*.184,.87,.033],[1,1,1],[-.32,side*.35,0],true)
    add(chest,facing,'#cd9355',[side*.184,.872,.050],[.96,.96,.67],[-.32,side*.35,0])
    add(chest,facing,'#ad59b5',[side*.182,.873,.054],[.85,.81,.60],[-.32,side*.35,0])
    stroke(chest,'#b963c6',[[side*.026,.807,.177,.006,.005],[side*.094,.816,.169,.013,.011],
      [side*.172,.842,.143,.017,.012],[side*.220,.879,.113,.002,.003]],false,8)
    // Long split panels lift away from the robe. The bent silhouette shows
    // the trailing points even when the portrait is reduced to card size.
    const tails: Section[]=[[side*.114,.665,.096,.043,.014],[side*.150,.507,.115,.043,.017],
      [side*.176,.377,.143,.044,.014],[side*.213+.020,.282,.153,.040,.013],
      [side*.249+.045,.201,.139,.023,.010],[side*.277+.066,.184,.109,.003,.003]]
    stroke(skirt,'#54206e',tails,true)
    stroke(skirt,'#af56b8',tails.map(([x,y,z,w,d])=>[x+side*w*.70,y,z+d*.52,w*.22,d*.50]),false,8)
    const eye=s.layer('eyes',true)
    const slit=[[.024,-.012],[.061,-.015],[.109,.001],[.170,side>0?.059:.036],[.151,-.006],
      [.125,-.036],[.089,-.050],[.057,-.039]]
    const shape=(f:number)=>leaf(slit.map(([x,y])=>[side*(.095+(x-.095)*f),-.010+(y+.010)*f]),.005)
    add(eye,shape(1),'#ff751b',[0,1.096,.185])
    add(eye,shape(.77),'#ffc13f',[0,1.096,.193])
    add(eye,shape(.47),'#fff1a0',[0,1.097,.199])
    line(chest,'#dfae68',[[side*.170,.865,.103],[side*.132,.832,.145],
      [side*.079,.801,.170],[side*.026,.800,.187]],.005)
    add(chest,jewel,gilt,[side*.13,.831,.149],[.013,.017,.008],[0,side*.45,0])
    // A pair of raised seam lines visually lead into the peaked opening.
    stroke(hood,'#b44cc7',[[side*.242,1.121,.142,.003,.004],[side*.209,1.218,.145,.014,.010],
      [side*.132,1.293,.130,.014,.008],[side*.055,1.347,.103,.002,.002]])
  }
  add(hood,jewel,brass,[.019,1.319,.229],[.028,.035,.017],[-.47,0,0])
  add(hood,jewel,gilt,[.019,1.322,.236],[.018,.026,.011],[-.47,0,0])
  const wisp=s.layer('wisp',true)
  stroke(wisp,'#ba6cf2',[[-.025,.905,.296,.003,.003],[-.004,.919,.300,.014,.012],
    [.010,.943,.304,.026,.019],[-.005,.968,.300,.014,.012],[.009,.997,.290,.002,.002]])
  add(wisp,star,'#ffe0fa',[.008,.943,.324],[.018,.029,.008])
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
  stroke(cuff,master?'#a65bc0':mage?'#ab81be':'#f0ce83',[lip(.39,.91),lip(.49,.95)],false,10)
  if (master) {
    const bone='#efd1ac'
    oval(hand,bone,[wx,wy-.003,.204],[.067,.042,.064],[-.2,0,-side*.13],true)
    for (let i=0;i<4;i++) {
      const finger=s.layer('claw'+id+i)
      const u=side*(.300+(i-1.5)*.027), v=wy+.005-Math.abs(i-1.5)*.006
      const tipZ=.320-Math.abs(i-1.4)*.019, end=v-.077+(i===3?.021:0)
      const tipX=u+side*(.012+(i-1.5)*.011)
      stroke(finger,bone,[[u,v,.233,.017,.019],[u+side*.006,v+.006,.258,.017,.017],
        [tipX,v-.016,tipZ,.014,.014],[tipX,end+.011,tipZ+.012,.009,.010],
        [tipX-side*.002,end-.009,tipZ+.005,.004,.004]],false,8)
      stroke(finger,'#b59da8',[[tipX,end+.019,tipZ+.018,.010,.005],
        [tipX,end,tipZ+.020,.008,.004],[tipX-side*.006,end-.020,tipZ-.001,.001,.001]],false,8)
      if(i===1) stroke(finger,gold,[[u+side*.004,v+.005,.251,.018,.018],
        [u+side*.006,v+.006,.260,.018,.018]],false,8)
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
  const wood=s.layer('staff'), light=s.layer('lantern',true), burst=s.layer('burst',true)
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
    // The gilded ferrule twists up into the socket rather than ending in a straight band.
    stroke(wood,gold,[[x+.014,1.041,z+.014,.007,.006],[x+.041,1.079,z+.023,.014,.010],
      [x+.059,1.117,z+.020,.011,.009],[x+.056,1.145,z+.020,.002,.003]],false,8)
  } else {
    add(wood,rim,gold,[x,y,z],[.102,.102,.098],undefined,true)
    add(wood,rim,gilt,[x,y,z+.006],[.077,.077,.071])
    for (let i=0;i<8;i++) {
      const a=tau*i/8, len=i%2?.037:.066
      const ray=leaf([[-.020,-.009],[.011,-.006],[.018,.009],[.016,len*.60],[.024,len],
        [-.004,len*.70],[-.018,.018]],.011)
      add(wood,ray,i%2?gold:gilt,[x+.101*Math.sin(a),y+.101*Math.cos(a),z],[1,1,1],[0,0,-a])
    }
    oval(light,'#ffd15a',[x,y,z],[.051,.054,.028])
    oval(light,'#fff5ac',[x-.007,y+.007,z+.012],[.038,.040,.026])
    add(light,star,'#fffde2',[x-.011,y+.012,z+.040],[.022,.028,.012])
    for(const side of [-1,1]) {
      stroke(wood,side<0?gold:gilt,[[x+.009,1.050,z,.013,.012],[x+side*.041,1.075,z,.015,.011],
        [x+side*.063,1.111,z,.012,.008],[x+side*.062,1.139,z,.002,.002]],false,8)
    }
    brooch(wood,[x+.007,1.063,z+.021],.021,teal)
  }
  for(let i=0;i<9;i++) {
    const a=tau*i/9, d=.105+(i%3)*.026
    add(burst,star,mage?(i%2?'#ffbb58':'#ff7954'):(i%2?gilt:'#fff6b2'),
      [x+Math.cos(a)*d,y+Math.sin(a)*d,z+.025+(i%2)*.028],[.015+i%3*.005,.029+i%3*.007,.015],[0,0,a-.5])
  }
  if(!mage) {
    const motes=s.layer('blessing',true)
    for (const [dx,dy,k] of [[.030,.048,.035],[.077,.080,.017],[-.015,.083,.014],[.072,.015,.011]]) {
      add(motes,star,'#ffeb92',[.250+dx,.558+dy,.235],[k,k*1.3,.011])
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
    boots(s,mage)
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
  const ferrule=new Vector3(.165*(.637-.035),.035-.637,.005)
  const ruby=new Vector3().fromArray(offsets.burst).sub(new Vector3().fromArray(offsets.staff))
  const aim=new Vector3(), end=new Vector3(), correction=new Quaternion()
  function aimFromGrip(localEnd:Vector3,weight:number) {
    const staff=bones.staff
    end.copy(localEnd).multiply(staff.scale).applyQuaternion(staff.quaternion).normalize()
    correction.setFromUnitVectors(end,aim.normalize())
    correction.multiply(staff.quaternion)
    staff.quaternion.slerp(correction,weight)
  }
  function poseMageStaff(present:number,lift:number) {
    const staff=bones.staff
    aim.set(-.134,.004,.173)
    bones.wristL.worldToLocal(root.localToWorld(aim)).sub(staff.position)
    const lengthY=Math.sqrt(Math.max(0,aim.lengthSq()-ferrule.x**2-ferrule.z**2))
    staff.scale.y=1+(1-present)*(lengthY/Math.abs(ferrule.y)-1)
    aimFromGrip(ferrule,1)
    if(present>0) {
      // Lead the ruby on a rising arc outside the brim as the elbow unfolds.
      aim.set(-.54+.22*lift,1.00+.28*lift,.106)
      bones.wristL.worldToLocal(root.localToWorld(aim)).sub(staff.position)
      aimFromGrip(ruby,present)
      const heelY=root.worldToLocal(staff.localToWorld(end.copy(ferrule))).y
      if(heelY<.004) {
        const gripY=root.worldToLocal(staff.localToWorld(end.set(ferrule.x,0,ferrule.z))).y
        staff.scale.y*=(gripY-.004)/(gripY-heelY)
      }
    }
  }
  const palmRotation=new Quaternion(), cameraRotation=new Quaternion()
  function faceMotes(camera:Camera) {
    bones.wristR.getWorldQuaternion(palmRotation)
    bones.blessing.quaternion.copy(palmRotation).invert().multiply(camera.getWorldQuaternion(cameraRotation))
  }
  return {root,bones,claws,skeleton,glow,halo,reachL,reachR,poseMageStaff,faceMotes}
}
type Actor=ReturnType<typeof makeActor>
function ease(t:number,a:number,b:number) {
  const u=Math.max(0,Math.min(1,(t-a)/(b-a)))
  return u*u*(3-2*u)
}
function phrase(t:number,start:number,peak:number,release:number,end:number) {
  return ease(t,start,peak)*(1-ease(t,release,end))
}
function animateHero(actor: Actor, mage: boolean, pose: MenuPose, camera: Camera) {
  const b=actor.bones, idle=pose.anim==='idle' ? pose.t%8 : 0
  const cheer=pose.anim==='cheer' ? pose.t : 0, a=tau*idle/8
  const breath=Math.sin(a*2), sway=Math.sin(a)
  const sign=phrase(idle,3.08,3.88,4.63,5.29), strokeBeard=sign*Math.sin((idle-3.83)*6.4)
  const prep=phrase(cheer,0,.19,.20,.39), lift=phrase(cheer,.19,.46,.94,1.52)
  const overshoot=phrase(cheer,.27,.47,.48,.68), settle=phrase(cheer,.98,1.23,1.24,1.6)
  const spark=phrase(cheer,.38,.55,.68,1.12), laugh=phrase(cheer,.39,.56,.85,1.16)*Math.sin((cheer-.46)*16)
  const blink=phrase(idle,2.10,2.180,2.200,2.31)+phrase(idle,6.78,6.87,6.89,7.01)
  b.legL.rotation.y=mage?-.32:-.18
  b.legR.rotation.y=(mage?.40:.47)+.035*lift
  b.spine.position.x=(mage?-.027:.022)+.009*sway
  b.spine.rotation.set((mage?.18:-.053)+.029*breath+.13*prep-.17*lift,
    (mage?.025:-.16)+.043*sway+(mage?.14:-.14)*lift,(mage?.185:-.105)+.026*sway-(mage?.19:.05)*lift)
  b.chest.scale.set(1+.012*breath,1+.023*breath,1+.029*breath)
  b.chest.rotation.x=.015*breath+(mage?.085*laugh:0)
  b.neck.rotation.set((mage?-.10:.015)+.013*breath+.085*prep-(mage?.22:.16)*lift,
    (mage?.37:.53)+.084*Math.sin(a+.29)+(mage?.17:.25)*sign,(mage?-.036:.195)+.035*sway)
  b.head.rotation.set((mage?.019:-.052)+.023*Math.sin(2*a+.43)+.086*sign,0,
    (mage?-.10:-.074)*sign-(mage?.12:.15)*lift+.045*settle)
  b.eyes.scale.y=(mage?.92:1)*(1-.95*blink)*(1-(mage?.55:.16)*lift)
  b.browL.rotation.z=(mage?-.09:.10)*sign+(mage?.15:.09)*lift
  b.browR.rotation.z=(mage?.16:-.10)*sign-(mage?.11:.06)*lift
  b.hem.rotation.set(.042*breath+.05*lift,(mage?-.10:.13)+.040*sway+.087*lift,(mage?-.035:.034)-.031*sway)
  b.train.rotation.set(.11+.053*Math.sin(2*a-.54)+.38*lift, .075*sway,-.044*sway+.12*lift)
  b.mane.rotation.set(.040*Math.sin(2*a-.65)+.08*lift, .064*sway, .046*Math.sin(a-.55)-.088*sign+.09*settle)
  b.beard.rotation.set(-.045+.054*Math.sin(2*a-.45)-.19*sign-.16*lift+.085*laugh,.074*sway,.083*sign)
  b.tip.rotation.set(.060*Math.sin(2*a-.51),.043*sway,.14*Math.sin(a-.52)+.20*prep-.29*overshoot+.15*laugh+.12*settle)

  // Staff arm: shoulder takes the weight, elbow leads the lift, wrist keeps
  // the long staff upright as the elbow arcs out from the body.
  b.shoulderL.rotation.set(mage?.32:-.12,-.035+.040*sway,(mage?.12:-.21)+.026*breath+.21*prep)
  b.elbowL.rotation.set(-.08,.030*sway,-.12)
  b.wristL.rotation.set(-.02,0,.08)
  b.staff.rotation.set(.024+(mage?.012:0)*breath,0,(mage?-.10:.35)-.18*prep-.06*lift+.08*settle)
  if (mage) {
    b.browR.position.y=.200+.013*sign+.018*lift
    b.whiskerL.rotation.z=-.07*sign-.22*lift-.06*laugh
    b.whiskerR.rotation.z=.11*sign+.24*lift+.07*laugh
    b.mouth.scale.set(1+.14*lift,.63+1.01*lift+.27*laugh,1)
    actor.reachL(lift,-.133,.015,.127,-1,.02,.06,-.05)
    actor.poseMageStaff(phrase(cheer,.22,.38,1.22,1.45),lift)
    b.shoulderR.rotation.set(.02-.49*lift,.19+.39*lift,.51+.79*lift)
    b.elbowR.rotation.set(-.03-.84*lift+.07*laugh,-.30+.44*lift,-.06+.52*lift)
    b.wristR.rotation.set(.32-.80*lift,-.20+.40*lift,.26+.29*lift)
    actor.reachR(sign,.016,.019+.034*strokeBeard,.222,1,-.77-.21*strokeBeard,-.95,-.43)
    actor.reachR(lift,.185,.071+.022*laugh,.088,1,-.77,.76,-.18)
  } else {
    actor.reachL(lift,-.199,.045+.012*overshoot,.120,-1,.03,.07,-.04)
    b.shoulderR.rotation.set(-.29-.30*lift,.34+.19*lift,.46+.39*lift)
    b.elbowR.rotation.set(-.39-.36*lift,.13+.17*lift,.24+.16*lift)
    b.wristR.rotation.set(-.59-.16*lift,.22,-.21+.40*lift)
    actor.reachR(sign,.197,.065,.110,1,-1.20,.72,-.48)
    b.blessing.scale.setScalar(sign*(1.10+.16*Math.sin(a*9)))
    if (sign>0) actor.faceMotes(camera)
    else b.blessing.quaternion.identity()
  }
  b.wristR.scale.setScalar(mage?1.22:1.18)
  b.burst.scale.setScalar(spark*(.69+ease(cheer,.38,.98)*(mage?.92:.78)))
  b.burst.rotation.z=spark*.36
  b.lantern.scale.setScalar(mage?1:1+.13*breath+.39*spark)
  actor.glow.color.setScalar((mage?.97:1.06)+.065*breath+.34*spark)
  actor.halo!.scale.setScalar((mage?.125:.181)+.019*breath+(mage?.19:.30)*spark)
}

function animateMaster(actor: Actor, pose: MenuPose) {
  const b=actor.bones, idle=pose.anim==='idle' ? pose.t%8 : 0, a=tau*idle/8
  const cheer=pose.anim==='cheer' ? pose.t : 0
  const hover=Math.sin(2*a), drift=Math.sin(a), plot=phrase(idle,3.02,3.95,4.64,5.50)
  const gather=phrase(cheer,0,.21,.24,.44), spread=phrase(cheer,.22,.51,.94,1.53)
  const snap=phrase(cheer,.31,.50,.51,.70), ripple=phrase(cheer,.37,.62,.83,1.54)
  const blink=phrase(idle,2.32,2.42,2.45,2.58)+phrase(idle,6.68,6.78,6.82,6.95)
  b.hips.position.set(.024*drift,.45+.044*hover-.057*gather+.078*spread,0)
  b.spine.rotation.set(.076+.030*hover+.19*gather-.15*spread,-.25+.071*drift+.23*spread,-.072+.049*Math.sin(a+.42))
  b.chest.scale.set(1+.012*hover,1+.015*hover,1+.017*hover)
  b.neck.rotation.set(.010+.047*Math.sin(2*a-.64)+.18*plot-.15*spread,.57+.11*drift-.15*plot,-.086+.043*Math.sin(a+.22))
  b.head.rotation.z=.15*plot+.08*gather+.12*spread
  b.head.scale.set(1.10,1.02,1.02)
  b.eyes.position.x=.010*drift+.008*plot
  b.eyes.scale.set(1+.10*spread,1-.92*blink-.24*plot+.51*spread,1)
  actor.glow.color.setScalar(1+.08*hover+.66*spread)
  b.hem.rotation.set(.064*Math.sin(2*a-.95)-.17*ripple,.14*Math.sin(a-.74)-.18*gather+.32*ripple,.10+.086*drift)
  b.hem.scale.set(1+.053*hover+.30*ripple,1-.085*ripple,1+.065*hover+.24*ripple)
  b.train.rotation.set(.077+.068*Math.sin(2*a-.80)+.30*ripple,.13*drift,-.11-.079*drift-.11*ripple)
  b.tip.rotation.z=.071*Math.sin(2*a-.66)-.13*snap
  b.wisp.scale.setScalar(phrase(idle,3.65,4.04,4.65,5.04)*(.95+.13*Math.sin(8*a)))
  b.wisp.rotation.y=.48*Math.sin(4*a)
  for (let i=0;i<2;i++) {
    const side=i===0?-1:1, wave=Math.sin(2*a+side*.57)
    const upper=i===0?b.shoulderL:b.shoulderR, elbow=i===0?b.elbowL:b.elbowR, wrist=i===0?b.wristL:b.wristR
    // One hand conducts high with the palm turned in; the other hangs
    // low, knuckles first. Both elbows open together on the selection beat.
    const high=i===1?1:0
    wrist.scale.setScalar(1.15)
    const reach=i===0?actor.reachL:actor.reachR
    if(high) reach(1,.177,.047+.016*wave,.118,side,-1.63,.69,.63)
    else {
      upper.rotation.set(.08+.12*wave-.34*gather,-side*(.06-.065*drift+.66*gather),side*(.19+.07*wave))
      elbow.rotation.set(-.13-.078*wave,-side*.06,side*.19)
      wrist.rotation.set(.43+.11*wave,-side*.11,side*.04)
    }
    reach(Math.max(plot,.83*gather),-side*.086,-.015,.191,side,-.93,-side*.75,side*.19)
    reach(spread,side*(.25+.013*snap),.055+.018*high,.091,side,-.39,side*.97,-side*.25)
    for (let j=0;j<4;j++) {
      actor.claws[i*4+j].rotation.set(.14+.18*Math.sin(3*a+j*.83+i)-.25*plot-.31*spread,
        side*(j-1.5)*(.032+.079*spread),0)
    }
  }
}

function MenuCaster({kind,pose}: Props & {kind:Caster}) {
  const actor=useMemo(()=>makeActor(kind),[kind])
  useEffect(()=>()=>{actor.skeleton.dispose(); actor.glow.dispose()},[actor])
  useFrame(({camera})=>{
    if (kind==='maestro') animateMaster(actor,pose)
    else animateHero(actor,kind==='mage',pose,camera)
  })
  return <group name={'HD '+kind} scale={kind==='priestess'?.895:kind==='mage'?.935:1.025} dispose={null}>
    <BlobShadow radius={kind==='maestro'?.33:.293} />
    <primitive object={actor.root} />
  </group>
}
export function HdPriestess({pose}: Props) { return <MenuCaster kind="priestess" pose={pose} /> }
export function HdMage({pose}: Props) { return <MenuCaster kind="mage" pose={pose} /> }
export function HdMaestro({pose}: Props) { return <MenuCaster kind="maestro" pose={pose} /> }
