import { useState } from 'react'
import { setSound, soundSettings, unlockAudio } from '../audio/sfx'

// Sound settings: music and effects on/off separately, remembered on this device.
export default function SoundToggle({ floating = false }: { floating?: boolean }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState(soundSettings())
  const toggle = (kind: 'music' | 'sfx') => {
    unlockAudio()
    setSound(kind, !state[kind])
    setState(soundSettings())
  }
  const allOff = !state.music && !state.sfx
  return (
    <div className={floating ? 'sound-settings is-floating' : 'sound-settings'}>
      <button
        type="button"
        className="ui-button ui-icon-button sound-toggle"
        aria-label="Sonido"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
          {allOff ? (
            <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" strokeWidth="1.6" />
          ) : (
            <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" stroke="currentColor" strokeWidth="1.4" fill="none" />
          )}
        </svg>
      </button>
      {open && (
        <div className="sound-menu panel" role="group" aria-label="Sonido">
          <button type="button" className={state.music ? 'switch is-on' : 'switch'} aria-pressed={state.music} onClick={() => toggle('music')}>
            <span>Música</span>
            <i />
          </button>
          <button type="button" className={state.sfx ? 'switch is-on' : 'switch'} aria-pressed={state.sfx} onClick={() => toggle('sfx')}>
            <span>Efectos</span>
            <i />
          </button>
        </div>
      )}
    </div>
  )
}
