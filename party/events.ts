// POST /api/event: anonymous usage events into Workers Analytics Engine.
// No ids, cookies, IPs or room codes. The only request data kept is the 2-letter country.
// Pure parts (parseBody, sanitizeEvent) are unit tested; handleEvent does the I/O.
//
// Analytics Engine column layout (dataset `stitchfour_events`, empty string = n/a):
//   index1  = event name
//   blob1   = event name
//   blob2   = mode      'bot' | 'local' | 'online'
//   blob3   = level     'easy' | 'medium' | 'hard' (bot only)
//   blob4   = outcome   game_end: 'win'|'loss'|'draw' ('p1'|'p2' in pass & play)
//                       install: 'accepted'|'dismissed'; update_applied: 'idle'|'patch'|'fresh'
//   blob5   = reason    'four' | 'draw' | 'timeout' | 'forfeit'
//   blob6   = country   2-letter, from Cloudflare
//   blob7   = platform  'ios' | 'android' | 'desktop' | 'other'
//   blob8   = display   'standalone' | 'browser'
//   blob9   = theme     'light' | 'dark'
//   blob10  = setting key   'sound' | 'haptics' | 'theme' | 'level'
//   blob11  = setting value 'on' | 'off' | 'light' | 'dark' | 'system' | 'easy' | 'medium' | 'hard'
//   double1 = moves (0..42)
//   double2 = durationSec (0..86400)
//   double3 = value (reserved, 0)
import {
  DISPLAYS, INSTALL_OUTCOMES, LEVELS, MAX_BODY_BYTES, MAX_EVENTS, MODES, OUTCOMES, PLATFORMS, REASONS,
  SETTING_KEYS, SETTING_VALUES, THEMES, UPDATE_WHENS, type EventName,
} from '../shared/events'

type Field = 'mode' | 'level' | 'outcome' | 'reason' | 'platform' | 'display' | 'theme' | 'when' | 'key' | 'value' | 'moves' | 'durationSec'

interface Rule {
  values?: readonly string[] // string enum
  max?: number // number, clamped to 0..max
  required?: boolean
}

const mode: Rule = { values: MODES, required: true }
const level: Rule = { values: LEVELS }
const moves: Rule = { max: 42 }
const none = {}

// Whitelist: event name -> allowed props. Anything else is dropped.
const SPEC: Record<EventName, Partial<Record<Field, Rule>>> = {
  app_open: {
    platform: { values: PLATFORMS, required: true },
    display: { values: DISPLAYS, required: true },
    theme: { values: THEMES, required: true },
    mode,
  },
  game_start: { mode, level },
  game_end: {
    mode,
    level,
    outcome: { values: OUTCOMES, required: true },
    reason: { values: REASONS },
    moves,
    durationSec: { max: 86_400 },
  },
  game_abandon: { mode, level, moves },
  undo: { mode },
  room_create: none,
  room_join: none,
  room_full: none,
  rematch: none,
  install: { outcome: { values: INSTALL_OUTCOMES, required: true } },
  ios_hint_shown: none,
  update_applied: { when: { values: UPDATE_WHENS, required: true } },
  reaction: none,
  setting: { key: { values: SETTING_KEYS, required: true }, value: { required: true, values: Object.values(SETTING_VALUES).flat() } },
}

export interface DataPoint {
  indexes: [string]
  blobs: string[]
  doubles: number[]
}

const isEvent = (name: string): name is EventName => Object.hasOwn(SPEC, name)

/** Parses and size-checks a request body. Returns the raw events array, or null for a 400. */
export function parseBody(text: string): unknown[] | null {
  if (text.length > MAX_BODY_BYTES || new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const events = (body as { events?: unknown }).events
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTS) return null
  return events
}

export const cleanCountry = (v: unknown) => (typeof v === 'string' && /^[A-Z]{2}$/.test(v) ? v : '')

/** Whitelists one event: unknown names/props are dropped, numbers clamped, strings must be enum values. */
export function sanitizeEvent(raw: unknown, country = ''): DataPoint | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const name = o.e
  if (typeof name !== 'string' || !isEvent(name)) return null

  const spec = SPEC[name]
  const s: Partial<Record<Field, string>> = {}
  const n: Partial<Record<Field, number>> = {}
  for (const [field, rule] of Object.entries(spec) as [Field, Rule][]) {
    const v = o[field]
    if (v === undefined || v === null) {
      if (rule.required) return null
      continue
    }
    if (rule.values) {
      if (typeof v !== 'string' || !rule.values.includes(v)) return null
      s[field] = v
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      n[field] = Math.min(Math.max(Math.round(v), 0), rule.max ?? 0)
    } else if (rule.required) return null
  }
  // a setting value must belong to its key
  if (name === 'setting' && !SETTING_VALUES[s.key as keyof typeof SETTING_VALUES]?.includes(s.value ?? '')) return null

  return {
    indexes: [name],
    blobs: [
      name,
      s.mode ?? '',
      s.mode === 'bot' ? (s.level ?? '') : '',
      s.outcome ?? s.when ?? '',
      s.reason ?? '',
      cleanCountry(country),
      s.platform ?? '',
      s.display ?? '',
      s.theme ?? '',
      s.key ?? '',
      name === 'setting' ? (s.value ?? '') : '',
    ],
    doubles: [n.moves ?? 0, n.durationSec ?? 0, 0],
  }
}

interface EventRequest {
  method: string
  url: string
  headers: Headers
  text(): Promise<string>
  cf?: { country?: unknown }
}

const res = (status: number) => new Response(null, { status })

export async function handleEvent(request: EventRequest, env: { EVENTS?: AnalyticsEngineDataset }): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })

  // cheap guards, nothing per user: same-origin only, declared size
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return res(400)
  const len = Number(request.headers.get('content-length'))
  if (len > MAX_BODY_BYTES) return res(400)

  const events = parseBody(await request.text())
  if (!events) return res(400)

  if (env.EVENTS) {
    const country = cleanCountry(request.cf?.country)
    for (const raw of events) {
      const point = sanitizeEvent(raw, country)
      if (!point) continue
      try {
        env.EVENTS.writeDataPoint(point)
      } catch {
        // analytics never fails a request
      }
    }
  }
  return res(204)
}
