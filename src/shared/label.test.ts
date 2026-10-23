import { describe, expect, it } from 'vitest'
import { assertValidLabel, isReverseDnsLabel, isValidLabel, LabelError } from './label'

describe('isValidLabel', () => {
  it.each([
    'com.paolobozzini.backup',
    'com.agentdesk.test.foo',
    'homebrew.mxcl.postgresql@14',
    'org.example.My_Agent-2',
    'a',
    'A1',
    'x'.repeat(255)
  ])('accepts %s', (label) => {
    expect(isValidLabel(label)).toBe(true)
  })

  it.each([
    ['empty', ''],
    ['too long', 'x'.repeat(256)],
    ['leading dot', '.com.example'],
    ['trailing dot', 'com.example.'],
    ['leading dash (looks like a flag)', '-k'],
    ['leading underscore', '_com.example'],
    ['double dot', 'com..example'],
    ['parent traversal', '..'],
    ['slash', 'com/example'],
    ['backslash', 'com\\example'],
    ['space', 'com.example agent'],
    ['tab', 'com.example\tagent'],
    ['newline', 'com.example\nagent'],
    ['NUL', 'com.example\0'],
    ['shell metachar ;', 'com.example;rm'],
    ['shell metachar $', 'com.$HOME'],
    ['backtick', 'com.`id`'],
    ['quote', "com.example'"],
    ['colon', 'com:example'],
    ['unicode lookalike', 'com.exаmple']
  ])('rejects %s', (_name, label) => {
    expect(isValidLabel(label)).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isValidLabel(undefined)).toBe(false)
    expect(isValidLabel(null)).toBe(false)
    expect(isValidLabel(42)).toBe(false)
    expect(isValidLabel({})).toBe(false)
  })
})

describe('assertValidLabel', () => {
  it('returns the label when valid', () => {
    expect(assertValidLabel('com.example.a')).toBe('com.example.a')
  })

  it('throws LabelError when invalid', () => {
    expect(() => assertValidLabel('bad label')).toThrow(LabelError)
  })

  it('does not echo control characters in the message', () => {
    try {
      assertValidLabel('a\nb')
    } catch (e) {
      expect((e as Error).message).not.toContain('\n')
    }
  })
})

describe('isReverseDnsLabel', () => {
  it.each(['com.example.agent', 'io.github.user.tool', 'com.agentdesk.test.x'])(
    'accepts %s',
    (label) => expect(isReverseDnsLabel(label)).toBe(true)
  )

  it.each([
    ['single segment', 'agent'],
    ['two segments', 'com.example'],
    ['numeric tld', '1.example.agent'],
    ['empty segment', 'com..agent'],
    ['invalid label', 'com.example agent']
  ])('rejects %s', (_name, label) => {
    expect(isReverseDnsLabel(label)).toBe(false)
  })
})
