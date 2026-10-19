import { describe, expect, it } from 'vitest'
import { namePair, randomName } from '../shared/names'
import { helloName, renameTo, validPair } from './anon'

describe('anonymous names', () => {
  it('matched rooms ignore the name the client sends', () => {
    const names: [string, string] = ['mossy-fern', 'tiny-otter']
    expect(helloName(names, 1, 'Frank')).toBe('mossy-fern')
    expect(helloName(names, 2, 'Frank')).toBe('tiny-otter')
  })
  it('normal rooms clean the requested name', () => {
    expect(helloName(null, 1, '  Frank   H ')).toBe('Frank H')
    expect(helloName(null, 2, '   ')).toBe('Player')
  })
  it('renames are ignored in matched rooms', () => {
    expect(renameTo(['a-b', 'c-d'], 'Frank')).toBeNull()
    expect(renameTo(null, ' Frank ')).toBe('Frank')
    expect(renameTo(null, '  ')).toBeNull()
  })
  it('validates the name pair', () => {
    expect(validPair(['mossy-fern', 'tiny-otter'])).toBe(true)
    expect(validPair(['same', 'same'])).toBe(false)
    expect(validPair(['a'])).toBe(false)
    expect(validPair(['', 'b'])).toBe(false)
    expect(validPair([' padded ', 'b'])).toBe(false)
    expect(validPair('x')).toBe(false)
  })
  it('makes fresh, distinct, well-formed names', () => {
    for (let i = 0; i < 200; i++) {
      const [a, b] = namePair()
      expect(a).not.toBe(b)
      expect(a).toMatch(/^[a-z]+-[a-z]+$/)
    }
    expect(randomName(() => 0)).toBe('mossy-fern')
  })
})
