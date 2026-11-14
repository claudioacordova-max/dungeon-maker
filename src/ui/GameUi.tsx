import { useGame } from '../game/store'
import Hud from './Hud'
import { GameOverScreen, PauseScreen, TitleScreen } from './screens'

// UI overlay above the canvas. It ignores the pointer; only its controls and screens take it.
export default function GameUi() {
  const screen = useGame((s) => s.screen)

  return (
    <div className="ui">
      {(screen === 'playing' || screen === 'paused') && <Hud />}
      {screen === 'title' && <TitleScreen />}
      {screen === 'paused' && <PauseScreen />}
      {screen === 'gameover' && <GameOverScreen />}
    </div>
  )
}
