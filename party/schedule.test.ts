import { describe, expect, it } from 'vitest'
import { RECONNECT_MS } from '../shared/protocol'
import { ROOM_TTL_MS, cleanupAt, dueActions, nextAlarm, type ClockState } from './schedule'

const T = 1_000_000
const base = (over: Partial<ClockState> = {}): ClockState => ({
  status: 'playing',
  turnDeadline: T + 120_000,
  goneSince: { 1: null, 2: null },
  lastActive: T,
  live: 2,
  ...over,
})

describe('dueActions', () => {
  it('nothing due early', () => {
    expect(dueActions(base(), T + 1)).toEqual({ forfeit: null, timeout: false, cleanup: false })
  })
  it('turn timeout due at the deadline', () => {
    expect(dueActions(base(), T + 120_000).timeout).toBe(true)
  })
  it('forfeit due after the reconnect window', () => {
    const s = base({ goneSince: { 1: null, 2: T } })
    expect(dueActions(s, T + RECONNECT_MS - 1).forfeit).toBeNull()
    expect(dueActions(s, T + RECONNECT_MS).forfeit).toBe(2)
  })
  it('no turn or forfeit actions outside playing', () => {
    const s = base({ status: 'over', turnDeadline: null, goneSince: { 1: T, 2: null } })
    expect(dueActions(s, T + 10 * RECONNECT_MS)).toMatchObject({ forfeit: null, timeout: false })
  })
  it('cleanup due only when idle for the TTL', () => {
    const idle = base({ live: 0, status: 'waiting', turnDeadline: null })
    expect(dueActions(idle, T + ROOM_TTL_MS - 1).cleanup).toBe(false)
    expect(dueActions(idle, T + ROOM_TTL_MS).cleanup).toBe(true)
    expect(dueActions({ ...idle, live: 1 }, T + ROOM_TTL_MS * 2).cleanup).toBe(false)
  })
})

describe('nextAlarm', () => {
  it('is null for an occupied waiting room', () => {
    expect(nextAlarm(base({ status: 'waiting', turnDeadline: null }))).toBeNull()
  })
  it('turn deadline while playing', () => {
    expect(nextAlarm(base())).toBe(T + 120_000)
  })
  it('picks the earliest of turn deadline and forfeit', () => {
    const s = base({ goneSince: { 1: T, 2: null } })
    expect(nextAlarm(s)).toBe(T + RECONNECT_MS)
    expect(nextAlarm({ ...s, turnDeadline: T + 10_000 })).toBe(T + 10_000)
  })
  it('cleanup when idle, even after the game is over', () => {
    const s = base({ status: 'over', turnDeadline: null, live: 0, lastActive: T })
    expect(cleanupAt(s)).toBe(T + ROOM_TTL_MS)
    expect(nextAlarm(s)).toBe(T + ROOM_TTL_MS)
  })
  it('game timers beat cleanup when both are scheduled', () => {
    const s = base({ live: 0, goneSince: { 1: T, 2: T } })
    expect(nextAlarm(s)).toBe(T + RECONNECT_MS)
  })
  it('ignores the forfeit clock when not playing', () => {
    expect(nextAlarm(base({ status: 'waiting', turnDeadline: null, goneSince: { 1: T, 2: null } }))).toBeNull()
  })
})
