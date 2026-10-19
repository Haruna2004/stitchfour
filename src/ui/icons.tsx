// Hand-drawn inline icons. Stitches = dashed strokes, knots = dots.
import { useId } from 'react'

type P = { size?: number; className?: string }

/** Wooden thread spool with a loose tail. Opens the menu. */
export function SpoolIcon({ size = 28, className }: P) {
  const id = useId()
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <defs>
        <linearGradient id={`${id}t`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".28" />
          <stop offset=".38" stopColor="#fff" stopOpacity=".16" />
          <stop offset=".62" stopColor="#fff" stopOpacity=".04" />
          <stop offset="1" stopColor="#000" stopOpacity=".3" />
        </linearGradient>
        <linearGradient id={`${id}w`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--wood-light)" />
          <stop offset="1" stopColor="var(--wood)" />
        </linearGradient>
      </defs>
      {/* wound thread */}
      <rect x="8.2" y="6.6" width="11.6" height="14.8" fill="var(--thread-red)" />
      <path
        d="M8.2 8.4 19.8 7.7M8.2 10.4 19.8 9.7M8.2 12.4 19.8 11.7M8.2 14.4 19.8 13.7M8.2 16.4 19.8 15.7M8.2 18.4 19.8 17.7M8.2 20.4 19.8 19.7"
        stroke="#fff6ec"
        strokeOpacity=".32"
        strokeWidth=".7"
      />
      <path
        d="M8.2 9.4 19.8 8.7M8.2 11.4 19.8 10.7M8.2 13.4 19.8 12.7M8.2 15.4 19.8 14.7M8.2 17.4 19.8 16.7M8.2 19.4 19.8 18.7"
        stroke="#3a120f"
        strokeOpacity=".22"
        strokeWidth=".6"
      />
      <rect x="8.2" y="6.6" width="11.6" height="14.8" fill={`url(#${id}t)`} />
      {/* flanges */}
      <rect x="5.6" y="3.4" width="16.8" height="3.8" rx="1.7" fill={`url(#${id}w)`} stroke="var(--wood-dark)" strokeWidth=".8" />
      <rect x="5.6" y="20.8" width="16.8" height="3.8" rx="1.7" fill={`url(#${id}w)`} stroke="var(--wood-dark)" strokeWidth=".8" />
      <ellipse cx="14" cy="5.3" rx="2.2" ry=".8" fill="var(--wood-dark)" opacity=".55" />
      {/* loose tail */}
      <path
        d="M19.6 11.2c3.2.4 4.6 2.6 3.6 5-.8 2-3 2.4-2.6 4.6.3 1.6 1.8 2.3 3.6 2.6"
        fill="none"
        stroke="var(--thread-red)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function UndoIcon({ size = 24, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.6 5.4 5 10l4.6 4.6" strokeWidth="2.2" />
      <path d="M5.6 10h8.9a4.75 4.75 0 0 1 0 9.5H9.8" strokeWidth="2" strokeDasharray="2.7 2.1" />
    </svg>
  )
}

export function ChatIcon({ size = 24, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M5.2 4.8h13.6a2.6 2.6 0 0 1 2.6 2.6v7.2a2.6 2.6 0 0 1-2.6 2.6h-6.6l-4.4 3.4v-3.4H5.2a2.6 2.6 0 0 1-2.6-2.6V7.4a2.6 2.6 0 0 1 2.6-2.6Z"
        fill="currentColor"
        fillOpacity=".1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <g fill="currentColor">
        <circle cx="8.3" cy="11" r="1.25" />
        <circle cx="12" cy="11" r="1.25" />
        <circle cx="15.7" cy="11" r="1.25" />
      </g>
    </svg>
  )
}

export function ChevronIcon({ size = 12, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3 4.6 3 3 3-3" />
    </svg>
  )
}

export function CloseIcon({ size = 18, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="m4.5 4.5 9 9M13.5 4.5l-9 9" />
    </svg>
  )
}

export function ShareIcon({ size = 18, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 11V2.6M5.8 5.6 9 2.4l3.2 3.2" />
      <path d="M6 8H4.6A1.6 1.6 0 0 0 3 9.6v4.8A1.6 1.6 0 0 0 4.6 16h8.8a1.6 1.6 0 0 0 1.6-1.6V9.6A1.6 1.6 0 0 0 13.4 8H12" strokeDasharray="2.4 1.8" />
    </svg>
  )
}

/** Friendly little screen for the Computer. */
export function ComputerIcon({ size = 32, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="5" width="24" height="17" rx="3.5" fill="currentColor" fillOpacity=".08" strokeWidth="1.7" />
      <rect x="7" y="8" width="18" height="11" rx="1.8" strokeWidth="1" strokeDasharray="2 1.7" opacity=".55" />
      <circle cx="12.6" cy="12.6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="19.4" cy="12.6" r="1.3" fill="currentColor" stroke="none" />
      <path d="M13.2 15.6q2.8 2 5.6 0" strokeWidth="1.5" />
      <path d="M16 22v4M12 26.5h8" strokeWidth="1.7" />
    </svg>
  )
}

/** Two pieces side by side. */
export function PassIcon({ size = 32, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="12" cy="16" r="7.6" fill="var(--thread-red)" />
      <circle cx="12" cy="16" r="5.2" fill="none" stroke="#fff6ec" strokeOpacity=".55" strokeWidth="1" strokeDasharray="1.8 1.4" />
      <circle cx="20.4" cy="16" r="7.6" fill="var(--thread-gold)" stroke="var(--panel)" strokeWidth="1.4" />
      <circle cx="20.4" cy="16" r="5.2" fill="none" stroke="#fff6ec" strokeOpacity=".6" strokeWidth="1" strokeDasharray="1.8 1.4" />
    </svg>
  )
}

/** Two pieces joined by a thread. */
export function OnlineIcon({ size = 32, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M11 16c2.4-6 7.6 6 10 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2.2 1.8" />
      <circle cx="7.4" cy="16" r="5.6" fill="var(--thread-red)" />
      <circle cx="7.4" cy="16" r="3.6" fill="none" stroke="#fff6ec" strokeOpacity=".55" strokeWidth=".9" strokeDasharray="1.5 1.2" />
      <circle cx="24.6" cy="16" r="5.6" fill="var(--thread-gold)" />
      <circle cx="24.6" cy="16" r="3.6" fill="none" stroke="#fff6ec" strokeOpacity=".6" strokeWidth=".9" strokeDasharray="1.5 1.2" />
    </svg>
  )
}

/** Stitched circular arrow: a fresh version is ready. */
export function UpdateIcon({ size = 16, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden>
      <path d="M13.2 9.2A5.3 5.3 0 1 1 11.6 4" strokeWidth="1.7" strokeDasharray="2.6 1.7" />
      <path d="M12.6 1.6v3.1H9.5" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )
}
