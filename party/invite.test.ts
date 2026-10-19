import { describe, expect, it } from 'vitest'
import { inviteCode } from './invite'

const code = (qs: string) => inviteCode(new URL(`https://x.test/${qs}`))

describe('inviteCode', () => {
  it('accepts valid codes, normalised', () => {
    expect(code('?room=ABCDEF')).toBe('ABCDEF')
    expect(code('?room=abc-def')).toBe('ABCDEF')
  })
  it('rejects missing or invalid codes', () => {
    expect(code('')).toBeNull()
    expect(code('?room=')).toBeNull()
    expect(code('?room=ABC')).toBeNull()
    expect(code('?room=ABCDE0')).toBeNull() // 0 is not in the alphabet
    expect(code('?room=' + 'A'.repeat(100))).toBeNull()
  })
})
