import { useState } from 'react'
import { isMuted, setMuted, unlockAudio } from '../audio/sfx'

// Sound on/off (music and effects), remembered on this device.
export default function SoundToggle({ floating = false }: { floating?: boolean }) {
  const [muted, setState] = useState(isMuted())
  return (
    <button
      type="button"
      className={floating ? 'ui-button ui-icon-button sound-toggle is-floating' : 'ui-button ui-icon-button sound-toggle'}
      aria-label={muted ? 'Activar sonido' : 'Silenciar'}
      aria-pressed={muted}
      onClick={() => {
        unlockAudio()
        setMuted(!muted)
        setState(!muted)
      }}
    >
      <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
        {muted ? (
          <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" strokeWidth="1.6" />
        ) : (
          <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" stroke="currentColor" strokeWidth="1.4" fill="none" />
        )}
      </svg>
    </button>
  )
}
