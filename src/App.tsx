import { lazy, Suspense, useEffect } from 'react'
import { startInput } from './game/input'
import { isMobileTarget } from './game/target'
import { useNet } from './net/connection'
import GameUi from './ui/GameUi'
import { LoadingScreen } from './ui/screens'

// Game shell: the 3D game under the UI overlay. Mobile targets: a stage with a fixed short axis and a flexible
// long axis (shell.css). The menus are plain HTML; the 3D part (Three.js, models) is a separate chunk that is
// fetched in the background from the lobby (preloadGame) and only drawn during a match.
// ?models shows every 3D model and its animations (art review), instead of the game.
const SHOWCASE = new URLSearchParams(location.search).has('models')
// ?photos renders the menu portraits from the models (see PhotoStudio.tsx).
const PHOTOS = new URLSearchParams(location.search).has('photos')

const GameView = lazy(() => import('./scene/GameView'))
const Showcase = lazy(() => import('./models/Showcase'))
const PhotoStudio = lazy(() => import('./ui/PhotoStudio'))

export default function App() {
  useEffect(startInput, [])
  const inMatch = useNet((s) => s.status === 'room' && s.phase !== 'lobby')
  if (SHOWCASE || PHOTOS) {
    return <Suspense fallback={null}>{PHOTOS ? <PhotoStudio /> : <Showcase />}</Suspense>
  }

  const game = (
    <div className="game">
      {inMatch && (
        <Suspense fallback={<LoadingScreen label="Preparando la mazmorra…" />}>
          <GameView />
        </Suspense>
      )}
      <GameUi />
    </div>
  )

  return isMobileTarget ? (
    <div className="stage-host">
      <div className="stage">{game}</div>
      {/* The game keeps running behind this hint (multiplayer: it cannot pause). */}
      <div className="rotate-hint" role="alert">
        Gira el dispositivo
      </div>
    </div>
  ) : (
    game
  )
}
