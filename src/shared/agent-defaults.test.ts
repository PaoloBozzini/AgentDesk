import { describe, expect, it } from 'vitest'
import {
  defaultLogPaths,
  labelSegment,
  newAgentForm,
  SCRIPT_PATH,
  SCRIPT_STUB,
  suggestLabel,
  withDefaultLogPaths
} from './agent-defaults'
import { emptyAgentForm, validateAgentForm } from './agent-form'
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
  it('uses one file, ~/Library/Logs/<label>/output.log, for both streams', () => {
    expect(defaultLogPaths('/Users/t', 'com.t.x')).toEqual({
      stdout: '/Users/t/Library/Logs/com.t.x/output.log',
      stderr: '/Users/t/Library/Logs/com.t.x/output.log'
    })
    expect(defaultLogPaths('/Users/t/', 'a').stdout).toBe('/Users/t/Library/Logs/a/output.log')
  })
})

describe('withDefaultLogPaths', () => {
  it('fills blank paths only', () => {
    const form = { ...emptyAgentForm(), label: 'com.t.x', standardErrorPath: '/tmp/mine.log' }
    const out = withDefaultLogPaths(form, '/Users/t')
    expect(out.standardOutPath).toBe('/Users/t/Library/Logs/com.t.x/output.log')
    expect(out.standardErrorPath).toBe('/tmp/mine.log')
    expect(form.standardOutPath).toBe('')
  })

  it('does nothing while the label is invalid', () => {
    const form = { ...emptyAgentForm(), label: '../x' }
    expect(withDefaultLogPaths(form, '/Users/t')).toBe(form)
  })
})

describe('newAgentForm', () => {
  it('starts in Script mode with a stub and a PATH that includes Homebrew', () => {
    const f = newAgentForm()
    expect(f.commandMode).toBe('script')
    expect(f.scriptShell).toBe('/bin/zsh')
    expect(f.script).toBe(SCRIPT_STUB)
    expect(f.environmentVariables).toEqual([{ key: 'PATH', value: SCRIPT_PATH }])
    expect(SCRIPT_PATH.split(':')).toEqual(
      expect.arrayContaining(['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'])
    )
  })

  it('needs only a label to be valid', () => {
    expect(validateAgentForm({ ...newAgentForm(), label: 'com.t.x' })).toEqual({})
  })
})
