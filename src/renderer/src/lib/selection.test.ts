import { describe, expect, it } from 'vitest'
import { isTypingTarget, stepSelection } from './selection'

describe('stepSelection', () => {
  const paths = ['/a', '/b', '/c']

  it('moves and clamps', () => {
    expect(stepSelection(paths, '/a', 1)).toBe('/b')
    expect(stepSelection(paths, '/c', 1)).toBe('/c')
    expect(stepSelection(paths, '/b', -1)).toBe('/a')
    expect(stepSelection(paths, '/a', -1)).toBe('/a')
  })

  it('starts at an end when nothing (visible) is selected', () => {
    expect(stepSelection(paths, null, 1)).toBe('/a')
    expect(stepSelection(paths, null, -1)).toBe('/c')
    expect(stepSelection(paths, '/hidden', 1)).toBe('/a')
  })

  it('returns null for an empty list', () => {
    expect(stepSelection([], '/a', 1)).toBeNull()
  })
})

describe('isTypingTarget', () => {
  it.each([
    [{ tagName: 'INPUT' }, true],
    [{ tagName: 'TEXTAREA' }, true],
    [{ tagName: 'SELECT' }, true],
    [{ tagName: 'DIV', isContentEditable: true }, true],
    [{ tagName: 'BUTTON' }, false],
    [null, false]
  ])('%j -> %s', (el, expected) => {
    expect(isTypingTarget(el as Element | null)).toBe(expected)
  })
})
