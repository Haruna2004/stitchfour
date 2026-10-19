import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import App from './App.tsx'
import { setupPWA } from './pwa'
import { CrashBoundary, CrashScreen } from './ui/CrashScreen'

setupPWA()

const rootEl = document.getElementById('root')!
let crashed = false

/** Last resort: swap whatever is (or isn't) on screen for the crash screen. */
function showCrash(error: unknown) {
  if (crashed) return
  crashed = true
  createRoot(rootEl).render(<CrashScreen error={error} />)
}

// Async errors (a failed sound fetch etc) are just logged. Only a blank page
// (nothing ever mounted) counts as unrecoverable.
const onGlobalError = (error: unknown) => {
  console.error('Unhandled:', error)
  setTimeout(() => !crashed && !rootEl.childElementCount && showCrash(error), 600)
}
window.addEventListener('error', (e) => onGlobalError(e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => onGlobalError(e.reason))

// Dev only: ?crash=1 throws during render to preview the crash screen
const devCrash = import.meta.env.DEV && new URLSearchParams(location.search).has('crash')
function DevCrash(): never {
  throw new Error('Test crash from ?crash=1')
}

const root = createRoot(rootEl, {
  // an error the boundary couldn't catch has unmounted the tree
  onUncaughtError: (error) => {
    console.error('Uncaught:', error)
    root.unmount()
    showCrash(error)
  },
})
root.render(
  <StrictMode>
    <CrashBoundary>{devCrash ? <DevCrash /> : <App />}</CrashBoundary>
  </StrictMode>,
)
