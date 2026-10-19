// Anonymous analytics events: shared by the client (src/lib/analytics.ts) and the
// Worker (party/events.ts). No ids, names or room codes ever appear here.

export const MODES = ['bot', 'local', 'online'] as const
export const LEVELS = ['easy', 'medium', 'hard'] as const
export const OUTCOMES = ['win', 'loss', 'draw', 'p1', 'p2'] as const // p1/p2 = pass & play
export const REASONS = ['four', 'draw', 'timeout', 'forfeit'] as const
export const PLATFORMS = ['ios', 'android', 'desktop', 'other'] as const
export const DISPLAYS = ['standalone', 'browser'] as const
export const THEMES = ['light', 'dark'] as const
export const INSTALL_OUTCOMES = ['accepted', 'dismissed'] as const
export const UPDATE_WHENS = ['idle', 'patch', 'fresh'] as const
export const SETTING_KEYS = ['sound', 'haptics', 'theme', 'level'] as const
export const SETTING_VALUES: Record<(typeof SETTING_KEYS)[number], readonly string[]> = {
  sound: ['on', 'off'],
  haptics: ['on', 'off'],
  theme: ['light', 'dark', 'system'],
  level: LEVELS,
}

type Mode = (typeof MODES)[number]
type Level = (typeof LEVELS)[number]
type None = Record<never, never>

export interface EventMap {
  app_open: { platform: (typeof PLATFORMS)[number]; display: (typeof DISPLAYS)[number]; theme: (typeof THEMES)[number]; mode: Mode }
  game_start: { mode: Mode; level?: Level }
  game_end: {
    mode: Mode
    level?: Level
    outcome: (typeof OUTCOMES)[number]
    reason?: (typeof REASONS)[number]
    moves: number
    durationSec: number
  }
  game_abandon: { mode: Mode; level?: Level; moves: number }
  undo: { mode: Mode }
  room_create: None
  room_join: None
  room_full: None
  rematch: None
  install: { outcome: (typeof INSTALL_OUTCOMES)[number] }
  ios_hint_shown: None
  update_applied: { when: (typeof UPDATE_WHENS)[number] }
  reaction: None
  match_seek: None
  match_found: { durationSec: number } // seconds waited
  match_cancel: { durationSec: number }
  match_timeout: None
  match_fallback_bot: { durationSec: number }
  setting: { key: (typeof SETTING_KEYS)[number]; value: 'on' | 'off' | 'light' | 'dark' | 'system' | Level }
}

export type EventName = keyof EventMap

export const MAX_EVENTS = 25 // per request
export const MAX_BODY_BYTES = 4096
