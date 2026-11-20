import { useNet } from '../net/connection'
import Hud from './Hud'
import { ConnectingScreen, EndScreen, HomeScreen, LobbyScreen } from './screens'

// UI overlay above the canvas. It ignores the pointer; only its controls and screens take it.
export default function GameUi() {
  const status = useNet((s) => s.status)
  const phase = useNet((s) => s.phase)
  const hasSnapshot = useNet((s) => !!s.snapshot)

  return (
    <div className="ui">
      {status === 'home' && <HomeScreen />}
      {status === 'connecting' && <ConnectingScreen />}
      {status === 'room' && phase === 'lobby' && <LobbyScreen />}
      {status === 'room' && phase !== 'lobby' && hasSnapshot && <Hud />}
      {status === 'room' && (phase === 'heroes-won' || phase === 'master-won') && <EndScreen />}
    </div>
  )
}
