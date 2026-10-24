import { describe, expect, it } from 'vitest'
import { defaultLogPaths, labelSegment, suggestLabel, withDefaultLogPaths } from './agent-defaults'
import { emptyAgentForm } from './agent-form'
import { isValidLabel } from './label'

describe('labelSegment', () => {
  it.each([
    ['backup', 'backup'],
    ['My Backup Job', 'my-backup-job'],
    ['Café Crème', 'cafe-creme'],
    ['  sync/photos!!  ', 'sync-photos'],
    ['john.doe', 'john-doe'],
    ['a_b-c', 'a_b-c'],
    ['--x--', 'x'],
    ['🚀', ''],
    ['', '']
  ])('%j -> %j', (input, expected) => {
    expect(labelSegment(input)).toBe(expected)
  })
})

describe('suggestLabel', () => {
  it('builds com.<username>.<name>', () => {
    expect(suggestLabel('paolobozzini', 'Nightly Backup')).toBe('com.paolobozzini.nightly-backup')
  })

  it('falls back when parts are empty', () => {
    expect(suggestLabel('', '')).toBe('com.user.agent')
    expect(suggestLabel('🙂', 'x')).toBe('com.user.x')
  })

  it.each(['a b', '../..', '-k', 'x'.repeat(300), 'ÅÄÖ', '$(id)'])(
    'always returns a valid label for %j',
    (name) => {
      expect(isValidLabel(suggestLabel(name, name))).toBe(true)
    }
  )

  it('truncates long names to the label limit', () => {
    const label = suggestLabel('u', 'x'.repeat(300))
    expect(label).toHaveLength(255)
    expect(label.startsWith('com.u.xxx')).toBe(true)
  })
})

describe('defaultLogPaths', () => {
  it('uses ~/Library/Logs/<label>/', () => {
    expect(defaultLogPaths('/Users/t', 'com.t.x')).toEqual({
      stdout: '/Users/t/Library/Logs/com.t.x/stdout.log',
      stderr: '/Users/t/Library/Logs/com.t.x/stderr.log'
    })
    expect(defaultLogPaths('/Users/t/', 'a').stdout).toBe('/Users/t/Library/Logs/a/stdout.log')
  })
})

describe('withDefaultLogPaths', () => {
  it('fills blank paths only', () => {
    const form = { ...emptyAgentForm(), label: 'com.t.x', standardErrorPath: '/tmp/mine.log' }
    const out = withDefaultLogPaths(form, '/Users/t')
    expect(out.standardOutPath).toBe('/Users/t/Library/Logs/com.t.x/stdout.log')
    expect(out.standardErrorPath).toBe('/tmp/mine.log')
    expect(form.standardOutPath).toBe('')
  })

  it('does nothing while the label is invalid', () => {
    const form = { ...emptyAgentForm(), label: '../x' }
    expect(withDefaultLogPaths(form, '/Users/t')).toBe(form)
  })
})
