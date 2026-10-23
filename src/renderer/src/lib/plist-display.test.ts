import { describe, expect, it } from 'vitest'
import { formatScalar, kindOf, orderedKeys } from './plist-display'

describe('orderedKeys', () => {
  it('puts known keys first in reading order, then the rest alphabetically', () => {
    expect(
      orderedKeys({ Zeta: 1, RunAtLoad: true, Alpha: 1, Label: 'x', ProgramArguments: [] })
    ).toEqual(['Label', 'ProgramArguments', 'RunAtLoad', 'Alpha', 'Zeta'])
  })
})

describe('kindOf', () => {
  it.each([
    [{ a: 1 }, 'dict'],
    [[1], 'array'],
    ['s', 'scalar'],
    [1, 'scalar'],
    [true, 'scalar'],
    [new Date(0), 'scalar'],
    [new Uint8Array(2), 'scalar']
  ] as const)('%j -> %s', (value, kind) => {
    expect(kindOf(value as never)).toBe(kind)
  })
})

describe('formatScalar', () => {
  it('formats each scalar type', () => {
    expect(formatScalar(true)).toBe('true')
    expect(formatScalar(42)).toBe('42')
    expect(formatScalar('')).toBe('""')
    expect(formatScalar(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01T00:00:00.000Z')
    expect(formatScalar(new Uint8Array(3))).toBe('<3 bytes of data>')
  })
})
