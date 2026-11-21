// Game sounds synthesised with Web Audio (no files, no dependencies). Short arcade-style effects built from
// oscillators and filtered noise, plus a quiet looping dungeon tune. Browsers only allow audio after a user
// gesture, so unlockAudio() runs on the first touch / key.

let ctx: AudioContext | null = null
let out: GainNode | null = null
let sfxBus: GainNode | null = null
let musicBus: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
const lastPlayed = new Map<string, number>()

// Music and effects can be switched off separately; both choices are remembered on this device.
const settings = { music: readSetting('dm-music'), sfx: readSetting('dm-sfx') }

function readSetting(key: string): boolean {
  try {
    return localStorage.getItem(key) !== '0'
  } catch {
    return true
  }
}

export function soundSettings() {
  return { ...settings }
}

export function setSound(kind: 'music' | 'sfx', on: boolean) {
  settings[kind] = on
  try {
    localStorage.setItem(kind === 'music' ? 'dm-music' : 'dm-sfx', on ? '1' : '0')
  } catch {
    // not remembered in private mode
  }
  if (!ctx) return
  if (kind === 'music' && musicBus) musicBus.gain.setTargetAtTime(on ? MUSIC_VOLUME : 0, ctx.currentTime, 0.05)
  if (kind === 'sfx' && sfxBus) sfxBus.gain.setTargetAtTime(on ? SFX_VOLUME : 0, ctx.currentTime, 0.03)
}

const SFX_VOLUME = 0.55
const MUSIC_VOLUME = 0.16

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = new AC()
    out = ctx.createGain()
    out.gain.value = 1
    out.connect(ctx.destination)
    sfxBus = ctx.createGain()
    sfxBus.gain.value = settings.sfx ? SFX_VOLUME : 0
    sfxBus.connect(out)
    musicBus = ctx.createGain()
    musicBus.gain.value = settings.music ? MUSIC_VOLUME : 0
    musicBus.connect(out)
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') void ctx.resume()
}

type Tone = { type?: OscillatorType; f0: number; f1?: number; dur: number; vol?: number; at?: number; attack?: number }
type Noise = { dur: number; vol?: number; at?: number; filter?: BiquadFilterType; f0?: number; f1?: number; q?: number }

function tone(t: Tone, scale: number, bus = sfxBus) {
  if (!ctx || !bus) return
  const start = ctx.currentTime + (t.at ?? 0)
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = t.type ?? 'square'
  osc.frequency.setValueAtTime(t.f0, start)
  if (t.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, t.f1), start + t.dur)
  const vol = (t.vol ?? 0.3) * scale
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), start + (t.attack ?? 0.005))
  gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur)
  osc.connect(gain).connect(bus)
  osc.start(start)
  osc.stop(start + t.dur + 0.02)
}

function noise(n: Noise, scale: number) {
  if (!ctx || !sfxBus || !noiseBuffer) return
  const start = ctx.currentTime + (n.at ?? 0)
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  const filter = ctx.createBiquadFilter()
  filter.type = n.filter ?? 'lowpass'
  filter.Q.value = n.q ?? 1
  filter.frequency.setValueAtTime(n.f0 ?? 2000, start)
  if (n.f1) filter.frequency.exponentialRampToValueAtTime(n.f1, start + n.dur)
  const gain = ctx.createGain()
  const vol = (n.vol ?? 0.3) * scale
  gain.gain.setValueAtTime(Math.max(0.0002, vol), start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + n.dur)
  src.connect(filter).connect(gain).connect(sfxBus)
  src.start(start, Math.random() * 0.5)
  src.stop(start + n.dur + 0.02)
}

// Plays a named effect at most every `gap` ms (several identical events in one frame sound as one).
function play(name: string, scale: number, fn: (s: number) => void, gap = 45) {
  if (!ctx || !settings.sfx || scale <= 0.02) return
  const now = performance.now()
  if (now - (lastPlayed.get(name) ?? -1e9) < gap) return
  lastPlayed.set(name, now)
  fn(Math.min(1, scale))
}

export const sfx = {
  click: (v = 1) => play('click', v, (s) => tone({ type: 'triangle', f0: 880, f1: 1320, dur: 0.06, vol: 0.18 }, s)),
  swing: (v = 1) => play('swing', v, (s) => noise({ dur: 0.16, vol: 0.35, filter: 'bandpass', f0: 900, f1: 3200, q: 0.8 }, s)),
  spin: (v = 1) =>
    play('spin', v, (s) => {
      noise({ dur: 0.35, vol: 0.4, filter: 'bandpass', f0: 600, f1: 4000, q: 0.7 }, s)
      tone({ type: 'sawtooth', f0: 220, f1: 660, dur: 0.3, vol: 0.12 }, s)
    }),
  shot: (v = 1) =>
    play('shot', v, (s) => {
      tone({ type: 'triangle', f0: 1200, f1: 300, dur: 0.12, vol: 0.25 }, s)
      noise({ dur: 0.08, vol: 0.18, filter: 'highpass', f0: 3000 }, s)
    }),
  critShot: (v = 1) =>
    play('crit-shot', v, (s) => {
      tone({ type: 'sawtooth', f0: 1800, f1: 200, dur: 0.22, vol: 0.25 }, s)
      noise({ dur: 0.2, vol: 0.3, filter: 'highpass', f0: 2000, f1: 6000 }, s)
    }),
  hit: (v = 1) =>
    play('hit', v, (s) => {
      tone({ type: 'square', f0: 220, f1: 90, dur: 0.09, vol: 0.28 }, s)
      noise({ dur: 0.07, vol: 0.3, filter: 'lowpass', f0: 2500 }, s)
    }),
  critHit: (v = 1) =>
    play('crit-hit', v, (s) => {
      tone({ type: 'square', f0: 330, f1: 110, dur: 0.14, vol: 0.32 }, s)
      tone({ type: 'triangle', f0: 1760, f1: 2640, dur: 0.12, vol: 0.15, at: 0.02 }, s)
      noise({ dur: 0.12, vol: 0.35, filter: 'lowpass', f0: 4000 }, s)
    }),
  noMana: (v = 1) => play('no-mana', v, (s) => tone({ type: 'sine', f0: 260, f1: 180, dur: 0.12, vol: 0.18 }, s), 250),
  light: (v = 1) =>
    play('light', v, (s) => {
      tone({ type: 'sine', f0: 990, f1: 1480, dur: 0.18, vol: 0.2 }, s)
      tone({ type: 'triangle', f0: 1980, dur: 0.1, vol: 0.08, at: 0.03 }, s)
    }),
  prayer: (v = 1) =>
    play('prayer', v, (s) => {
      ;[523, 659, 784, 1047].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.5 - i * 0.06, vol: 0.16, at: i * 0.05, attack: 0.04 }, s))
    }),
  heal: (v = 1) =>
    play('heal', v, (s) => {
      ;[784, 1175].forEach((f, i) => tone({ type: 'sine', f0: f, f1: f * 1.06, dur: 0.18, vol: 0.18, at: i * 0.07 }, s))
    }, 90),
  spark: (v = 1) =>
    play('spark', v, (s) => {
      noise({ dur: 0.16, vol: 0.3, filter: 'bandpass', f0: 1800, f1: 600, q: 1.2 }, s)
      tone({ type: 'sawtooth', f0: 520, f1: 260, dur: 0.12, vol: 0.12 }, s)
    }),
  polyCast: (v = 1) =>
    play('poly-cast', v, (s) => {
      tone({ type: 'sine', f0: 300, f1: 1200, dur: 0.3, vol: 0.2 }, s)
      tone({ type: 'triangle', f0: 600, f1: 2400, dur: 0.3, vol: 0.08, at: 0.04 }, s)
    }),
  poof: (v = 1) =>
    play('poof', v, (s) => {
      noise({ dur: 0.3, vol: 0.3, filter: 'lowpass', f0: 2000, f1: 300 }, s)
      // a little cluck
      tone({ type: 'square', f0: 900, f1: 600, dur: 0.05, vol: 0.14, at: 0.15 }, s)
      tone({ type: 'square', f0: 1000, f1: 650, dur: 0.06, vol: 0.14, at: 0.24 }, s)
    }, 120),
  ogreSlam: (v = 1) =>
    play('ogre-slam', v, (s) => {
      tone({ type: 'sine', f0: 110, f1: 40, dur: 0.4, vol: 0.5 }, s)
      noise({ dur: 0.3, vol: 0.4, filter: 'lowpass', f0: 900, f1: 100 }, s)
    }),
  ogreDie: (v = 1) =>
    play('ogre-die', v, (s) => {
      tone({ type: 'sawtooth', f0: 160, f1: 50, dur: 0.7, vol: 0.32 }, s)
      noise({ dur: 0.5, vol: 0.3, filter: 'lowpass', f0: 700, f1: 90 }, s)
    }),
  enemyHurt: (v = 1) => play('enemy-hurt', v, (s) => tone({ type: 'square', f0: 300, f1: 160, dur: 0.08, vol: 0.18 }, s), 70),
  slimeDie: (v = 1) =>
    play('slime-die', v, (s) => {
      tone({ type: 'sine', f0: 420, f1: 60, dur: 0.35, vol: 0.4 }, s)
      noise({ dur: 0.25, vol: 0.25, filter: 'lowpass', f0: 800, f1: 150 }, s)
    }),
  throwerDie: (v = 1) =>
    play('thrower-die', v, (s) => {
      tone({ type: 'square', f0: 700, f1: 120, dur: 0.3, vol: 0.22 }, s)
      tone({ type: 'square', f0: 500, f1: 90, dur: 0.3, vol: 0.15, at: 0.06 }, s)
    }),
  bossDie: (v = 1) =>
    play('boss-die', v, (s) => {
      tone({ type: 'sawtooth', f0: 220, f1: 30, dur: 1.4, vol: 0.4, attack: 0.02 }, s)
      noise({ dur: 1.2, vol: 0.4, filter: 'lowpass', f0: 1200, f1: 80 }, s)
    }),
  bossJump: (v = 1) =>
    play('boss-jump', v, (s) => {
      tone({ type: 'sawtooth', f0: 90, f1: 260, dur: 0.45, vol: 0.3, attack: 0.05 }, s)
      noise({ dur: 0.4, vol: 0.2, filter: 'bandpass', f0: 300, f1: 900 }, s)
    }),
  bossLand: (v = 1) =>
    play('boss-land', v, (s) => {
      tone({ type: 'sine', f0: 120, f1: 35, dur: 0.5, vol: 0.55 }, s)
      noise({ dur: 0.4, vol: 0.45, filter: 'lowpass', f0: 600, f1: 60 }, s)
    }),
  aim: (v = 1) => play('aim', v, (s) => tone({ type: 'sine', f0: 500, f1: 900, dur: 0.45, vol: 0.12, attack: 0.1 }, s), 120),
  orbThrow: (v = 1) =>
    play('orb', v, (s) => {
      tone({ type: 'sine', f0: 600, f1: 250, dur: 0.22, vol: 0.22 }, s)
      noise({ dur: 0.18, vol: 0.12, filter: 'bandpass', f0: 1200 }, s)
    }),
  heroHurt: (v = 1) =>
    play('hero-hurt', v, (s) => {
      tone({ type: 'square', f0: 520, f1: 180, dur: 0.18, vol: 0.3 }, s)
      noise({ dur: 0.1, vol: 0.25, filter: 'lowpass', f0: 1800 }, s)
    }, 120),
  heroDie: (v = 1) =>
    play('hero-die', v, (s) => {
      ;[523, 392, 311, 196].forEach((f, i) => tone({ type: 'square', f0: f, f1: f * 0.94, dur: 0.16, vol: 0.25, at: i * 0.12 }, s))
    }),
  respawn: (v = 1) =>
    play('respawn', v, (s) => {
      ;[392, 523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.12, vol: 0.2, at: i * 0.06 }, s))
    }),
  chargeFull: (v = 1) => play('charge', v, (s) => tone({ type: 'triangle', f0: 1320, f1: 1760, dur: 0.12, vol: 0.18 }, s), 200),
  chest: (v = 1) =>
    play('chest', v, (s) => {
      ;[659, 784, 988, 1319].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.14, vol: 0.2, at: i * 0.07 }, s))
    }),
  trap: (v = 1) =>
    play('trap', v, (s) => {
      noise({ dur: 0.12, vol: 0.35, filter: 'highpass', f0: 2500 }, s)
      tone({ type: 'square', f0: 900, f1: 400, dur: 0.06, vol: 0.15 }, s)
    }),
  door: (v = 1) =>
    play('door', v, (s) => {
      noise({ dur: 0.5, vol: 0.25, filter: 'lowpass', f0: 400, f1: 1200 }, s)
      tone({ type: 'triangle', f0: 392, dur: 0.15, vol: 0.18, at: 0.3 }, s)
      tone({ type: 'triangle', f0: 587, dur: 0.25, vol: 0.18, at: 0.42 }, s)
    }, 300),
  build: (v = 1) =>
    play('build', v, (s) => {
      tone({ type: 'square', f0: 180, f1: 120, dur: 0.08, vol: 0.25 }, s)
      tone({ type: 'square', f0: 240, f1: 160, dur: 0.08, vol: 0.25, at: 0.1 }, s)
    }),
  place: (v = 1) => play('place', v, (s) => tone({ type: 'triangle', f0: 440, f1: 660, dur: 0.08, vol: 0.22 }, s)),
  remove: (v = 1) => play('remove', v, (s) => tone({ type: 'triangle', f0: 660, f1: 330, dur: 0.08, vol: 0.2 }, s)),
  ready: (v = 1) =>
    play('ready', v, (s) => {
      tone({ type: 'triangle', f0: 523, dur: 0.1, vol: 0.22 }, s)
      tone({ type: 'triangle', f0: 784, dur: 0.18, vol: 0.22, at: 0.09 }, s)
    }),
  victory: () =>
    play('victory', 1, (s) => {
      ;[523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ type: 'square', f0: f, dur: i === 5 ? 0.6 : 0.14, vol: 0.2, at: i * 0.13 }, s))
    }),
  defeat: () =>
    play('defeat', 1, (s) => {
      ;[392, 370, 349, 262].forEach((f, i) => tone({ type: 'sawtooth', f0: f, f1: f * 0.97, dur: i === 3 ? 0.8 : 0.28, vol: 0.18, at: i * 0.3 }, s))
    }),
}

// ---------- Music: a short minor loop (bass, arpeggio, soft pad), scheduled ahead of time ----------

const BPM = 96
const STEP = 60 / BPM / 2 // eighth notes
const BASS = [45, 45, 52, 45, 48, 48, 43, 43, 45, 45, 52, 45, 41, 41, 43, 44]
const ARP = [57, 60, 64, 60, 57, 60, 64, 67, 55, 59, 62, 59, 57, 60, 64, 69]
let musicTimer: ReturnType<typeof setInterval> | null = null
let nextTime = 0
let stepIndex = 0

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)

export function startMusic() {
  if (!ctx || musicTimer) return
  nextTime = ctx.currentTime + 0.1
  stepIndex = 0
  musicTimer = setInterval(() => {
    if (!ctx || !musicBus) return
    while (nextTime < ctx.currentTime + 0.4) {
      const at = nextTime - ctx.currentTime
      const bar = Math.floor(stepIndex / 2) % BASS.length
      if (stepIndex % 2 === 0) tone({ type: 'triangle', f0: midi(BASS[bar]), dur: STEP * 1.8, vol: 0.5, at, attack: 0.01 }, 1, musicBus)
      if (stepIndex % 4 !== 3) tone({ type: 'square', f0: midi(ARP[stepIndex % ARP.length]), dur: STEP * 0.7, vol: 0.12, at }, 1, musicBus)
      if (stepIndex % 16 === 0) tone({ type: 'sine', f0: midi(ARP[0] + 12), dur: STEP * 14, vol: 0.12, at, attack: 0.6 }, 1, musicBus)
      nextTime += STEP
      stepIndex += 1
    }
  }, 100)
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer)
  musicTimer = null
}
