import { describe, expect, it } from 'vitest'
import { errorReport, formatCommand, quoteArg } from './command'

describe('quoteArg', () => {
  it.each([
    ['gui/501/com.a.b', 'gui/501/com.a.b'],
    ['-k', '-k'],
    ['', "''"],
    ['/Users/x/My Agents/a.plist', "'/Users/x/My Agents/a.plist'"],
    ["it's", "'it'\\''s'"],
    ['$HOME', "'$HOME'"]
  ])('%s -> %s', (arg, quoted) => {
    expect(quoteArg(arg)).toBe(quoted)
  })
})

describe('formatCommand', () => {
  it('joins quoted args', () => {
    expect(formatCommand(['launchctl', 'bootstrap', 'gui/501', '/a b/x.plist'])).toBe(
      "launchctl bootstrap gui/501 '/a b/x.plist'"
    )
  })
})

describe('errorReport', () => {
  it('includes summary, hint, command, exit code and output', () => {
    expect(
      errorReport('Load', {
        summary: 'Already loaded',
        hint: 'Use Reload.',
        command: ['launchctl', 'bootstrap', 'gui/501', '/x.plist'],
        exitCode: 5,
        stdout: '',
        stderr: 'Bootstrap failed: 5: Input/output error\n'
      })
    ).toBe(
      [
        'Load failed: Already loaded',
        'Use Reload.',
        '',
        '$ launchctl bootstrap gui/501 /x.plist',
        'exit code: 5',
        '',
        'stderr:',
        'Bootstrap failed: 5: Input/output error'
      ].join('\n')
    )
  })

  it('handles errors that never ran a command', () => {
    expect(
      errorReport('Load', { summary: 'Nope', command: [], exitCode: null, stdout: '', stderr: '' })
    ).toBe('Load failed: Nope\nexit code: none')
  })
})
