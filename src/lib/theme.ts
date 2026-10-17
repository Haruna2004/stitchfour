import { useEffect, useSyncExternalStore } from 'react'
import type { ThemePref } from './settings'

export type Theme = 'light' | 'dark'

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

function useSystemDark() {
  return useSyncExternalStore(
    (l) => {
      mq?.addEventListener('change', l)
      return () => mq?.removeEventListener('change', l)
    },
    () => mq?.matches ?? false,
  )
}

/** Resolves the preference to a concrete theme and applies it to <html>. */
export function useTheme(pref: ThemePref): Theme {
  const systemDark = useSystemDark()
  const theme: Theme = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const color = getComputedStyle(document.documentElement).getPropertyValue('--page').trim()
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => color && m.setAttribute('content', color))
  }, [theme])
  return theme
}
