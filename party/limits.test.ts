import { describe, expect, it } from 'vitest'
import {
  ABUSE_MAX_MSGS,
  MAX_MSG_BYTES,
  MAX_STRING,
  byteSize,
  check,
  createLimiter,
  parseClientMsg,
} from './limits'

describe('rate limiter', () => {
  it('allows a burst of 10 then drops', () => {
    const l = createLimiter(0)
    for (let i = 0; i < 10; i++) expect(check(l, 'move', 0)).toBe('ok')
    expect(check(l, 'move', 0)).toBe('drop')
  })
  it('refills about 4 per second', () => {
    const l = createLimiter(0)
    for (let i = 0; i < 10; i++) check(l, 'move', 0)
    expect(check(l, 'move', 100)).toBe('drop')
    expect(check(l, 'move', 300)).toBe('ok') // 1.2 tokens by now
    expect(check(l, 'move', 300)).toBe('drop')
  })
  it('never refills past the burst', () => {
    const l = createLimiter(0)
    check(l, 'move', 0)
    for (let i = 0; i < 10; i++) expect(check(l, 'move', 60_000 + i)).toBe('ok')
    expect(check(l, 'move', 60_011)).toBe('drop')
  })
  it('react once per 1.2s', () => {
    const l = createLimiter(0)
    expect(check(l, 'react', 0)).toBe('ok')
    expect(check(l, 'react', 1199)).toBe('drop')
    expect(check(l, 'react', 1200)).toBe('ok')
  })
  it('rename once per 2s, independent of react', () => {
    const l = createLimiter(0)
    expect(check(l, 'rename', 0)).toBe('ok')
    expect(check(l, 'react', 10)).toBe('ok')
    expect(check(l, 'rename', 1999)).toBe('drop')
    expect(check(l, 'rename', 2000)).toBe('ok')
  })
  it('cooldown drops do not burn tokens', () => {
    const l = createLimiter(0)
    check(l, 'react', 0)
    for (let i = 0; i < 5; i++) check(l, 'react', 10)
    expect(l.tokens).toBeCloseTo(9, 1)
  })
  it('flags sustained abuse (> 60 in 10s) and recovers next window', () => {
    const l = createLimiter(0)
    let last = 'ok'
    for (let i = 0; i < ABUSE_MAX_MSGS; i++) last = check(l, 'move', i * 100)
    expect(last).not.toBe('abuse')
    expect(check(l, 'move', 6_500)).toBe('abuse')
    expect(check(l, 'move', 10_001)).not.toBe('abuse')
  })
  it('normal play stays under the abuse limit', () => {
    const l = createLimiter(0)
    for (let i = 0; i < 40; i++) expect(check(l, 'move', i * 250)).toBe('ok') // 4/s
  })
})

describe('byteSize', () => {
  it('counts utf-8 bytes', () => {
    expect(byteSize('abc')).toBe(3)
    expect(byteSize('é')).toBe(2)
    expect(byteSize(new ArrayBuffer(5))).toBe(5)
    expect(byteSize('x'.repeat(5000))).toBeGreaterThan(MAX_MSG_BYTES)
  })
})

describe('parseClientMsg', () => {
  const p = (o: unknown) => parseClientMsg(JSON.stringify(o))
  it('accepts valid messages', () => {
    expect(p({ t: 'hello', clientId: 'abc', name: 'Ann' })).toEqual({ t: 'hello', clientId: 'abc', name: 'Ann' })
    expect(p({ t: 'move', col: 6, ply: 0 })).toEqual({ t: 'move', col: 6, ply: 0 })
    expect(p({ t: 'react', id: 9 })).toEqual({ t: 'react', id: 9 })
    expect(p({ t: 'rename', name: 'Bo' })).toEqual({ t: 'rename', name: 'Bo' })
    expect(p({ t: 'rematch' })).toEqual({ t: 'rematch' })
    expect(p({ t: 'leave' })).toEqual({ t: 'leave' })
  })
  it('rejects garbage', () => {
    for (const raw of ['', 'nope', 'null', '[]', '"x"', '1']) expect(parseClientMsg(raw)).toBeNull()
    expect(p({ t: 'nope' })).toBeNull()
    expect(p({})).toBeNull()
  })
  it('validates move fields', () => {
    expect(p({ t: 'move', col: 7, ply: 0 })).toBeNull()
    expect(p({ t: 'move', col: -1, ply: 0 })).toBeNull()
    expect(p({ t: 'move', col: 1.5, ply: 0 })).toBeNull()
    expect(p({ t: 'move', col: '1', ply: 0 })).toBeNull()
    expect(p({ t: 'move', col: 1, ply: -1 })).toBeNull()
    expect(p({ t: 'move', col: 1, ply: 99 })).toBeNull()
    expect(p({ t: 'move', col: 1 })).toBeNull()
  })
  it('validates react id', () => {
    expect(p({ t: 'react', id: 10 })).toBeNull()
    expect(p({ t: 'react', id: -1 })).toBeNull()
    expect(p({ t: 'react', id: 'a' })).toBeNull()
  })
  it('validates strings', () => {
    const long = 'x'.repeat(MAX_STRING + 1)
    expect(p({ t: 'hello', clientId: long, name: 'a' })).toBeNull()
    expect(p({ t: 'hello', clientId: '', name: 'a' })).toBeNull()
    expect(p({ t: 'hello', clientId: 'a', name: long })).toBeNull()
    expect(p({ t: 'hello', clientId: 5, name: 'a' })).toBeNull()
    expect(p({ t: 'rename', name: long })).toBeNull()
    expect(p({ t: 'rename', name: 5 })).toBeNull()
    expect(p({ t: 'hello', clientId: 'x'.repeat(MAX_STRING), name: 'x'.repeat(MAX_STRING) })).not.toBeNull()
  })
})
