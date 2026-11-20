import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isMobileTarget, target } from './game/target'
import './ui/tokens.css'
import './ui/shell.css'
import './ui/game.css' // after the shell, so game rules win

// shell.css styles each target profile from this attribute.
document.documentElement.dataset.target = target

if (isMobileTarget) {
  // Touch-first: no pinch or double-tap zoom. Safari ignores user-scalable, so also cancel its gesture events.
  document.querySelector('meta[name="viewport"]')?.setAttribute(
    'content',
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
  )
  document.addEventListener('gesturestart', (event) => event.preventDefault())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
