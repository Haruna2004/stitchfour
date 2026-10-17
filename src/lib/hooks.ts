import { useEffect, useState, useSyncExternalStore } from 'react'

/** navigator.onLine as state. */
export function useNetworkOnline(): boolean {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener('online', l)
      window.addEventListener('offline', l)
      return () => {
        window.removeEventListener('online', l)
        window.removeEventListener('offline', l)
      }
    },
    () => navigator.onLine,
  )
}

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const fn = () => setOn(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return on
}

export const canVibrate = () => typeof navigator !== 'undefined' && 'vibrate' in navigator
