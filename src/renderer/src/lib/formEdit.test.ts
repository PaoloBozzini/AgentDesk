import { describe, expect, it } from 'vitest'
import { emptyAgentForm } from '../../../shared/agent-form'
import { followLabel, intervalHint, linesToList, listToLines, tidyForm } from './formEdit'

describe('lines', () => {
  it('round-trips, keeping blank lines while typing', () => {
    expect(linesToList('')).toEqual([])
    expect(linesToList('a\n')).toEqual(['a', ''])
    expect(listToLines(linesToList('a\n\nb'))).toBe('a\n\nb')
  })
})

describe('tidyForm', () => {
  it('drops trailing blank arguments and blank watch paths', () => {
    const form = {
      ...emptyAgentForm(),
      programArguments: ['/bin/sh', '', '-c', '', ''],
      watchPaths: ['', '/a', '', '/b', '']
    }
    const out = tidyForm(form)
    expect(out.programArguments).toEqual(['/bin/sh', '', '-c'])
    expect(out.watchPaths).toEqual(['/a', '/b'])
    expect(form.programArguments).toHaveLength(5)
  })
})

describe('intervalHint', () => {
  it.each([
    ['900', 'every 15 min'],
    ['3600', 'every 1 h'],
    ['7200', 'every 2 h'],
    ['86400', 'every 1 day'],
    ['172800', 'every 2 days'],
    ['90', 'every 90 s'],
    ['0', ''],
    ['', ''],
    ['abc', ''],
    [' 60 ', 'every 1 min']
  ])('%j -> %j', (input, expected) => {
    expect(intervalHint(input)).toBe(expected)
  })
})

describe('followLabel', () => {
  const home = '/Users/t'
  const logs = (label: string): { standardOutPath: string; standardErrorPath: string } => ({
    standardOutPath: `/Users/t/Library/Logs/${label}/stdout.log`,
    standardErrorPath: `/Users/t/Library/Logs/${label}/stderr.log`
  })
  const at = (label: string, extra = {}): ReturnType<typeof emptyAgentForm> => ({
    ...emptyAgentForm(),
    label,
    ...logs(label),
    ...extra
  })

  it('moves default paths to the new label', () => {
    const prev = at('com.t.a')
    const out = followLabel(prev, { ...prev, label: 'com.t.ab' }, home)
    expect(out).toMatchObject(logs('com.t.ab'))
  })

  it('blanks them while the label is invalid, then refills', () => {
    const prev = at('com.t.a')
    const mid = followLabel(prev, { ...prev, label: 'com.t.' }, home)
    expect(mid.standardOutPath).toBe('')
    const out = followLabel(mid, { ...mid, label: 'com.t.b' }, home)
    expect(out).toMatchObject(logs('com.t.b'))
  })

  it('leaves typed or cleared paths alone', () => {
    const prev = at('com.t.a', { standardOutPath: '/tmp/mine.log', standardErrorPath: '' })
    const out = followLabel(prev, { ...prev, label: 'com.t.b' }, home)
    expect(out.standardOutPath).toBe('/tmp/mine.log')
    expect(out.standardErrorPath).toBe('')
  })

  it('does nothing when the label is unchanged', () => {
    const prev = at('com.t.a')
    const next = { ...prev, standardOutPath: '/x' }
    expect(followLabel(prev, next, home)).toBe(next)
  })
})
