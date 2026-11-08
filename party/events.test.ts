import { describe, expect, it, vi } from 'vitest'
import { cleanCountry, handleEvent, parseBody, sanitizeEvent } from './events'

const open = { e: 'app_open', platform: 'desktop', display: 'browser', theme: 'light', mode: 'bot' }

describe('parseBody', () => {
  it('accepts a valid batch', () => {
    expect(parseBody(JSON.stringify({ events: [open] }))).toEqual([open])
  })
  it('rejects bad json, shapes and counts', () => {
    expect(parseBody('nope')).toBeNull()
    expect(parseBody('[]')).toBeNull()
    expect(parseBody('{}')).toBeNull()
    expect(parseBody('{"events":[]}')).toBeNull()
    expect(parseBody('{"events":"x"}')).toBeNull()
    expect(parseBody(JSON.stringify({ events: Array(26).fill({ e: 'undo' }) }))).toBeNull()
    expect(parseBody(JSON.stringify({ events: Array(25).fill({ e: 'undo' }) }))).not.toBeNull()
  })
  it('rejects bodies over 4 KB', () => {
    expect(parseBody(JSON.stringify({ events: [{ e: 'undo', pad: 'x'.repeat(5000) }] }))).toBeNull()
    // multi-byte characters count as bytes, not characters
    expect(parseBody(JSON.stringify({ events: [{ e: 'undo', pad: 'é'.repeat(2100) }] }))).toBeNull()
  })
})

describe('sanitizeEvent', () => {
  it('maps app_open to the column layout', () => {
    expect(sanitizeEvent(open, 'NG')).toEqual({
      indexes: ['app_open'],
      blobs: ['app_open', 'bot', '', '', '', 'NG', 'desktop', 'browser', 'light', '', ''],
      doubles: [0, 0, 0],
    })
  })
  it('maps game_end with numbers', () => {
    const p = sanitizeEvent({ e: 'game_end', mode: 'bot', level: 'hard', outcome: 'win', reason: 'four', moves: 17, durationSec: 93.4 }, 'US')
    expect(p?.blobs).toEqual(['game_end', 'bot', 'hard', 'win', 'four', 'US', '', '', '', '', ''])
    expect(p?.doubles).toEqual([17, 93, 0])
  })
  it('drops unknown events and non-objects', () => {
    expect(sanitizeEvent({ e: 'purchase' })).toBeNull()
    expect(sanitizeEvent({ e: 'toString' })).toBeNull()
    expect(sanitizeEvent({ e: '__proto__' })).toBeNull()
    expect(sanitizeEvent({})).toBeNull()
    expect(sanitizeEvent(null)).toBeNull()
    expect(sanitizeEvent('app_open')).toBeNull()
    expect(sanitizeEvent([open])).toBeNull()
  })
  it('ignores unknown props', () => {
    const p = sanitizeEvent({ e: 'undo', mode: 'local', name: 'mossy-fern', clientId: 'abc', room: 'ABCDEF' })
    expect(p?.blobs).toEqual(['undo', 'local', '', '', '', '', '', '', '', '', ''])
    expect(JSON.stringify(p)).not.toMatch(/mossy|abc|ABCDEF/)
  })
  it('drops events with off-enum or missing required strings', () => {
    expect(sanitizeEvent({ ...open, platform: 'windows-phone' })).toBeNull()
    expect(sanitizeEvent({ ...open, theme: undefined })).toBeNull()
    expect(sanitizeEvent({ e: 'game_start', mode: 'solo' })).toBeNull()
    expect(sanitizeEvent({ e: 'game_start' })).toBeNull()
    expect(sanitizeEvent({ e: 'game_end', mode: 'bot', outcome: 'won' })).toBeNull()
    expect(sanitizeEvent({ e: 'install', outcome: 'maybe' })).toBeNull()
    expect(sanitizeEvent({ e: 'update_applied', when: 'now' })).toBeNull()
    expect(sanitizeEvent({ e: 'game_start', mode: 5 })).toBeNull()
  })
  it('only keeps level for bot games', () => {
    expect(sanitizeEvent({ e: 'game_start', mode: 'local', level: 'easy' })?.blobs[2]).toBe('')
    expect(sanitizeEvent({ e: 'game_start', mode: 'bot', level: 'easy' })?.blobs[2]).toBe('easy')
    expect(sanitizeEvent({ e: 'game_start', mode: 'bot', level: 'insane' })).toBeNull()
  })
  it('clamps numbers and ignores non-numbers', () => {
    const big = sanitizeEvent({ e: 'game_end', mode: 'local', outcome: 'p1', moves: 9999, durationSec: 1e12 })
    expect(big?.doubles).toEqual([42, 86_400, 0])
    const neg = sanitizeEvent({ e: 'game_abandon', mode: 'bot', moves: -5 })
    expect(neg?.doubles).toEqual([0, 0, 0])
    const nan = sanitizeEvent({ e: 'game_abandon', mode: 'bot', moves: 'lots' })
    expect(nan?.doubles).toEqual([0, 0, 0])
    expect(sanitizeEvent({ e: 'game_abandon', mode: 'bot', moves: Infinity })?.doubles[0]).toBe(0)
  })
  it('does not take numbers on events that have none', () => {
    expect(sanitizeEvent({ e: 'reaction', moves: 30, durationSec: 5 })?.doubles).toEqual([0, 0, 0])
  })
  it('puts install outcome and update timing in blob4', () => {
    expect(sanitizeEvent({ e: 'install', outcome: 'accepted' })?.blobs[3]).toBe('accepted')
    expect(sanitizeEvent({ e: 'update_applied', when: 'patch' })?.blobs[3]).toBe('patch')
  })
  it('validates a setting value against its key', () => {
    expect(sanitizeEvent({ e: 'setting', key: 'theme', value: 'dark' })?.blobs.slice(9)).toEqual(['theme', 'dark'])
    expect(sanitizeEvent({ e: 'setting', key: 'level', value: 'hard' })?.blobs.slice(9)).toEqual(['level', 'hard'])
    expect(sanitizeEvent({ e: 'setting', key: 'sound', value: 'off' })).not.toBeNull()
    expect(sanitizeEvent({ e: 'setting', key: 'sound', value: 'dark' })).toBeNull()
    expect(sanitizeEvent({ e: 'setting', key: 'name', value: 'on' })).toBeNull()
    expect(sanitizeEvent({ e: 'setting', key: 'theme', value: 'mossy-fern' })).toBeNull()
  })
  it('counts-only events carry nothing but the name and country', () => {
    for (const e of ['room_create', 'room_join', 'room_full', 'rematch', 'ios_hint_shown', 'reaction']) {
      expect(sanitizeEvent({ e, id: 3, text: 'hi' }, 'GB')?.blobs).toEqual([e, '', '', '', '', 'GB', '', '', '', '', ''])
    }
  })
})

describe('cleanCountry', () => {
  it('keeps only 2 uppercase letters', () => {
    expect(cleanCountry('NG')).toBe('NG')
    expect(cleanCountry('ng')).toBe('')
    expect(cleanCountry('T1')).toBe('')
    expect(cleanCountry('USA')).toBe('')
    expect(cleanCountry(undefined)).toBe('')
  })
})

describe('handleEvent', () => {
  const req = (body: string, init: RequestInit = {}) =>
    new Request('https://stitchfour.harunafaruk.com/api/event', { method: 'POST', body, ...init })
  const fake = () => ({ writeDataPoint: vi.fn() })

  it('writes valid events with the country and returns 204', async () => {
    const EVENTS = fake()
    const r = Object.assign(req(JSON.stringify({ events: [open, { e: 'nope' }, { e: 'undo', mode: 'bot' }] })), { cf: { country: 'NG' } })
    const out = await handleEvent(r, { EVENTS })
    expect(out.status).toBe(204)
    expect(EVENTS.writeDataPoint).toHaveBeenCalledTimes(2)
    expect(EVENTS.writeDataPoint.mock.calls[0][0].blobs[5]).toBe('NG')
  })
  it('returns 204 without a binding', async () => {
    expect((await handleEvent(req(JSON.stringify({ events: [open] })), {})).status).toBe(204)
  })
  it('returns 204 when every event is dropped', async () => {
    const EVENTS = fake()
    expect((await handleEvent(req('{"events":[{"e":"x"}]}'), { EVENTS })).status).toBe(204)
    expect(EVENTS.writeDataPoint).not.toHaveBeenCalled()
  })
  it('rejects bad payloads with 400', async () => {
    const EVENTS = fake()
    expect((await handleEvent(req('garbage'), { EVENTS })).status).toBe(400)
    expect((await handleEvent(req('{"events":[]}'), { EVENTS })).status).toBe(400)
    expect((await handleEvent(req('x'.repeat(5000)), { EVENTS })).status).toBe(400)
    expect((await handleEvent(req('{"events":[{"e":"undo","mode":"bot"}]}', { headers: { origin: 'https://evil.example' } }), { EVENTS })).status).toBe(400)
    expect(EVENTS.writeDataPoint).not.toHaveBeenCalled()
  })
  it('allows same-origin requests', async () => {
    const r = req('{"events":[{"e":"undo","mode":"bot"}]}', { headers: { origin: 'https://stitchfour.harunafaruk.com' } })
    expect((await handleEvent(r, {})).status).toBe(204)
  })
  it('rejects non-POST with 405', async () => {
    const r = new Request('https://stitchfour.harunafaruk.com/api/event', { method: 'GET' })
    expect((await handleEvent(r, {})).status).toBe(405)
  })
  it('survives a throwing binding', async () => {
    const EVENTS = { writeDataPoint: vi.fn(() => { throw new Error('boom') }) }
    expect((await handleEvent(req(JSON.stringify({ events: [open] })), { EVENTS })).status).toBe(204)
  })
})

describe('matchmaking events', () => {
  it('accepts the match_* events', () => {
    for (const e of ['match_seek', 'match_timeout']) expect(sanitizeEvent({ e })?.blobs[0]).toBe(e)
    expect(sanitizeEvent({ e: 'match_found', durationSec: 12.6 })?.doubles).toEqual([0, 13, 0])
    expect(sanitizeEvent({ e: 'match_cancel', durationSec: 4 })?.doubles).toEqual([0, 4, 0])
    expect(sanitizeEvent({ e: 'match_fallback_bot', durationSec: 31 })?.doubles).toEqual([0, 31, 0])
  })
  it('clamps the wait and drops ids', () => {
    expect(sanitizeEvent({ e: 'match_found', durationSec: 99_999 })?.doubles[1]).toBe(3600)
    const p = sanitizeEvent({ e: 'match_found', durationSec: 5, code: 'ABCDEF', clientId: 'xyz' })
    expect(JSON.stringify(p)).not.toMatch(/ABCDEF|xyz/)
  })
})
