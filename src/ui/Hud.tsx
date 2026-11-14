import { useGame } from '../game/store'
import { isMobileTarget } from '../game/target'
import { ClockIcon, CubeIcon, PauseIcon } from './icons'

// HUD anchored to the viewport corners. Placeholder readouts: replace with the game's information.
export default function Hud() {
  const seconds = useGame((s) => Math.floor(s.elapsed))
  const hits = useGame((s) => s.hits)
  const paused = useGame((s) => s.screen === 'paused')
  const togglePause = useGame((s) => s.togglePause)

  return (
    <div className="hud">
      <div className="hud-corner hud-top-left panel" role="group" aria-label="Tiempo">
        <ClockIcon />
        <span className="hud-value">{seconds}</span>
      </div>

      <div className="hud-corner hud-top-right">
        <button
          type="button"
          className="ui-button ui-icon-button"
          aria-label={isMobileTarget ? 'Pausa' : 'Pausa (Esc)'}
          disabled={paused}
          onClick={togglePause}
        >
          <PauseIcon />
        </button>
      </div>

      <div className="hud-corner hud-bottom-left panel" role="group" aria-label="Clics en el cubo">
        <CubeIcon />
        <span className="hud-value">{hits}</span>
      </div>
    </div>
  )
}
