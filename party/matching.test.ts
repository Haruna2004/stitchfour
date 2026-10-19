import { describe, expect, it } from 'vitest'
import { REPAIR_MS, REPAIR_WAIT_MS, SEEK_TIMEOUT_MS } from '../shared/protocol'
import { canPair, pairKey, planMatches, pruneRecent, seekingCount, type RecentPairs, type Seeker } from './matching'

const s = (id: string, clientId: string, since: number): Seeker => ({ id, clientId, since })
const ids = (pairs: [Seeker, Seeker][]) => pairs.map(([a, b]) => `${a.id}+${b.id}`)
const none: RecentPairs = new Map()

describe('planMatches', () => {
  it('pairs FIFO by since', () => {
    const plan = planMatches([s('d', 'D', 40), s('b', 'B', 20), s('a', 'A', 10), s('c', 'C', 30)], none, 100)
    expect(ids(plan.pairs)).toEqual(['a+b', 'c+d'])
    expect(plan.timedOut).toEqual([])
  })
  it('leaves an odd seeker waiting', () => {
    expect(ids(planMatches([s('a', 'A', 1), s('b', 'B', 2), s('c', 'C', 3)], none, 10).pairs)).toEqual(['a+b'])
  })
  it('never pairs a player with themself (two tabs)', () => {
    expect(planMatches([s('a1', 'A', 1), s('a2', 'A', 2)], none, 10).pairs).toEqual([])
    expect(ids(planMatches([s('a1', 'A', 1), s('a2', 'A', 2), s('b', 'B', 3)], none, 10).pairs)).toEqual(['a1+b'])
  })
  it('times out seekers after 5 minutes', () => {
    const plan = planMatches([s('a', 'A', 0), s('b', 'B', 1000)], none, SEEK_TIMEOUT_MS)
    expect(plan.timedOut.map((x) => x.id)).toEqual(['a'])
    expect(plan.pairs).toEqual([])
  })
  it('skips a recent pair while someone else is free', () => {
    const recent: RecentPairs = new Map([[pairKey('A', 'B'), 0]])
    const plan = planMatches([s('a', 'A', 1), s('b', 'B', 2), s('c', 'C', 3)], recent, 1000)
    expect(ids(plan.pairs)).toEqual(['a+c'])
  })
  it('re-pairs a recent pair once both waited 15s', () => {
    const recent: RecentPairs = new Map([[pairKey('A', 'B'), 0]])
    const seekers = [s('a', 'A', 1000), s('b', 'B', 2000)]
    expect(planMatches(seekers, recent, 2000 + REPAIR_WAIT_MS - 1).pairs).toEqual([])
    expect(ids(planMatches(seekers, recent, 2000 + REPAIR_WAIT_MS).pairs)).toEqual(['a+b'])
  })
})

describe('canPair', () => {
  it('allows a recent pair after the window', () => {
    const recent: RecentPairs = new Map([[pairKey('A', 'B'), 0]])
    expect(canPair(s('a', 'A', REPAIR_MS - 10), s('b', 'B', REPAIR_MS - 10), recent, REPAIR_MS - 1)).toBe(false)
    expect(canPair(s('a', 'A', REPAIR_MS), s('b', 'B', REPAIR_MS), recent, REPAIR_MS)).toBe(true)
  })
  it('pair keys ignore order', () => {
    expect(pairKey('x', 'y')).toBe(pairKey('y', 'x'))
  })
})

describe('helpers', () => {
  it('prunes old pairs', () => {
    const recent: RecentPairs = new Map([['old', 0], ['new', REPAIR_MS]])
    pruneRecent(recent, REPAIR_MS + 1)
    expect([...recent.keys()]).toEqual(['new'])
  })
  it('counts players, not tabs', () => {
    expect(seekingCount([s('a1', 'A', 1), s('a2', 'A', 2), s('b', 'B', 3)])).toBe(2)
    expect(seekingCount([])).toBe(0)
  })
})
