// Full-screen fallback for unrecoverable crashes. Self-contained: CSS tokens only,
// no stores, canvas or app state, so it still works when the rest has fallen over.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import './CrashScreen.css'

function startFresh() {
  try {
    sessionStorage.clear() // room code etc; localStorage settings + stats stay
  } catch {
    // storage blocked: just reload
  }
  location.replace('/')
}

/** A spool whose thread runs out in a line of stitches, then snaps. */
function LooseThread() {
  return (
    <svg className="crash-art" viewBox="0 0 240 132" aria-hidden>
      <defs>
        <linearGradient id="crash-wood" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--wood-light)" />
          <stop offset="1" stopColor="var(--wood)" />
        </linearGradient>
        <linearGradient id="crash-wind" x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".26" />
          <stop offset=".4" stopColor="#fff" stopOpacity=".18" />
          <stop offset=".65" stopColor="#fff" stopOpacity=".04" />
          <stop offset="1" stopColor="#000" stopOpacity=".28" />
        </linearGradient>
      </defs>

      {/* running stitch along the fabric, from the spool until it gives out */}
      <g className="crash-run" fill="none" strokeLinecap="round">
        <path
          d="M62 96 C 92 104, 112 104, 138 94 S 172 78, 186 82"
          stroke="var(--stitch-soft)"
          strokeWidth="1.2"
          strokeDasharray="0 6"
        />
        <path
          d="M62 96 C 92 104, 112 104, 138 94 S 172 78, 186 82"
          stroke="var(--thread-red)"
          strokeWidth="3.2"
          strokeDasharray="9 7"
        />
      </g>

      {/* the snapped end: a loose curl and a few frayed fibres */}
      <g className="crash-tail" fill="none" strokeLinecap="round">
        <path d="M186 82 C 200 84, 206 72, 198 64 S 182 60, 186 48 C 189 40, 200 38, 206 42" stroke="var(--thread-red)" strokeWidth="3.2" />
        <path d="M206 42 l 6 -5" stroke="var(--thread-red)" strokeWidth="1.3" />
        <path d="M206 42 l 8 -1" stroke="var(--thread-red)" strokeWidth="1.1" />
        <path d="M206 42 l 3 -7" stroke="var(--thread-red)" strokeWidth="1" opacity=".8" />
      </g>

      {/* a lone gold cross-stitch, left behind */}
      <g className="crash-x" strokeLinecap="round" stroke="var(--thread-gold)" strokeWidth="3.4">
        <path d="M150 40 l 14 14 M164 40 l -14 14" />
        <circle cx="150" cy="40" r="1.4" fill="var(--stitch)" stroke="none" />
        <circle cx="164" cy="54" r="1.4" fill="var(--stitch)" stroke="none" />
      </g>

      {/* spool */}
      <g transform="translate(22 36) rotate(-8 22 34)">
        <ellipse cx="22" cy="66" rx="24" ry="5" fill="#2a1a0a" opacity=".14" transform="translate(4 4)" />
        <rect x="7" y="8" width="30" height="52" fill="var(--thread-red)" />
        <rect x="7" y="8" width="30" height="52" fill="url(#crash-wind)" />
        <path
          d="M7 14h30M7 20h30M7 26h30M7 32h30M7 38h30M7 44h30M7 50h30M7 56h30"
          stroke="#fff6ec"
          strokeOpacity=".26"
          strokeWidth="1"
        />
        <rect x="0" y="0" width="44" height="9" rx="3" fill="url(#crash-wood)" />
        <rect x="0" y="59" width="44" height="9" rx="3" fill="url(#crash-wood)" />
        <path d="M3 4.5h38M3 63.5h38" stroke="var(--wood-dark)" strokeOpacity=".35" strokeWidth="1" strokeDasharray="3 3" />
      </g>
    </svg>
  )
}

export function CrashScreen({ error }: { error?: unknown }) {
  const msg = error instanceof Error ? error.message || error.name : error == null ? '' : String(error)
  return (
    <main className="crash linen" role="alert">
      <div className="crash-card linen-panel">
        <LooseThread />
        <h1 className="crash-title">It’s not you.</h1>
        <p className="crash-text">
          A stitch came loose on our side. Your settings and stats are safe and sound.
        </p>
        <button type="button" className="crash-btn" onClick={() => location.reload()}>
          Re-thread &amp; reload
        </button>
        <button type="button" className="crash-link" onClick={startFresh}>
          Start fresh
        </button>
        {msg && (
          <details className="crash-details">
            <summary>Details</summary>
            <code>{msg}</code>
          </details>
        )}
      </div>
    </main>
  )
}

interface State {
  error: unknown
  failed: boolean
}

/** Catches render crashes anywhere below and swaps in the crash screen. */
export class CrashBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, failed: false }

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Stitch Four crashed:', error, info.componentStack)
  }

  render() {
    return this.state.failed ? <CrashScreen error={this.state.error} /> : this.props.children
  }
}
