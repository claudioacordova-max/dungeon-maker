import type { ReactNode } from 'react'
import { useGame } from '../game/store'
import { isMobileTarget } from '../game/target'
import { ClockIcon, CubeIcon } from './icons'

// Full-screen overlays for each non-playing state. On desktop the first button takes focus for Enter/Space;
// mobile targets are touch first, so no autofocus ring and no keyboard hint.
const autoFocus = !isMobileTarget

function Screen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="screen" aria-label={label}>
      <div className="screen-panel panel">{children}</div>
    </section>
  )
}

export function TitleScreen() {
  const start = useGame((s) => s.start)
  return (
    <Screen label="Título">
      {/* The generator sets <title>; the title screen reuses it. */}
      <h1 className="screen-title">{document.title}</h1>
      <button type="button" className="ui-button ui-button-primary" autoFocus={autoFocus} onClick={start}>
        Jugar
      </button>
      {!isMobileTarget && (
        <p className="screen-hint">
          <kbd>Esc</kbd> pausa
        </p>
      )}
    </Screen>
  )
}

export function PauseScreen() {
  const togglePause = useGame((s) => s.togglePause)
  const endGame = useGame((s) => s.endGame)
  const toTitle = useGame((s) => s.toTitle)
  return (
    <Screen label="Pausa">
      <h2 className="screen-title">Pausa</h2>
      <button type="button" className="ui-button ui-button-primary" autoFocus={autoFocus} onClick={togglePause}>
        Continuar
      </button>
      <button type="button" className="ui-button" onClick={endGame}>
        Terminar partida
      </button>
      <button type="button" className="ui-button" onClick={toTitle}>
        Salir al título
      </button>
    </Screen>
  )
}

export function GameOverScreen() {
  const seconds = useGame((s) => Math.floor(s.elapsed))
  const hits = useGame((s) => s.hits)
  const start = useGame((s) => s.start)
  const toTitle = useGame((s) => s.toTitle)
  return (
    <Screen label="Fin de la partida">
      <h2 className="screen-title">Fin de la partida</h2>
      <div className="screen-stats">
        <span aria-label="Tiempo">
          <ClockIcon /> {seconds}
        </span>
        <span aria-label="Clics en el cubo">
          <CubeIcon /> {hits}
        </span>
      </div>
      <button type="button" className="ui-button ui-button-primary" autoFocus={autoFocus} onClick={start}>
        Jugar de nuevo
      </button>
      <button type="button" className="ui-button" onClick={toTitle}>
        Volver al título
      </button>
    </Screen>
  )
}
