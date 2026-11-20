import { sfx } from '../audio/sfx'
import { useNet } from '../net/connection'
import SoundToggle from './SoundToggle'
import Hud from './Hud'
import { ConnectingScreen, EndScreen, HomeScreen, LobbyScreen } from './screens'

// UI overlay above the canvas. It ignores the pointer; only its controls and screens take it.
export default function GameUi() {
  const status = useNet((s) => s.status)
  const phase = useNet((s) => s.phase)
  const hasSnapshot = useNet((s) => !!s.snapshot)
  const reconnecting = useNet((s) => s.reconnecting)

  return (
    <div
      className="ui"
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('button')) sfx.click()
      }}
    >
      {status !== 'room' || phase === 'lobby' ? <SoundToggle floating /> : null}
      {reconnecting && <div className="reconnect-toast">Reconectando…</div>}
      {status === 'home' && <HomeScreen />}
      {status === 'connecting' && <ConnectingScreen />}
      {status === 'room' && phase === 'lobby' && <LobbyScreen />}
      {status === 'room' && phase !== 'lobby' && hasSnapshot && <Hud />}
      {status === 'room' && (phase === 'heroes-won' || phase === 'master-won') && <EndScreen />}
    </div>
  )
}
