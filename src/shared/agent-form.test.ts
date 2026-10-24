import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'plist'
import { describe, expect, it } from 'vitest'
import {
  emptyAgentForm,
  emptyCalendarEntry,
  formToPlist,
  plistToForm,
  validateAgentForm,
  type AgentForm
} from './agent-form'
import type { PlistDict } from './plist-types'

const fixture = parse(
  readFileSync(join(__dirname, '../main/services/__fixtures__/plist/full-agent.plist'), 'utf8')
) as PlistDict

function roundTrip(data: PlistDict): PlistDict {
  const result = formToPlist(plistToForm(data))
  if (!result.ok) throw new Error(`invalid: ${JSON.stringify(result.errors)}`)
  return result.data
}

function form(overrides: Partial<AgentForm>): AgentForm {
  return { ...emptyAgentForm(), label: 'com.example.a', program: '/bin/true', ...overrides }
}

function errorsOf(overrides: Partial<AgentForm>): Record<string, string> {
  return validateAgentForm(form(overrides))
}

describe('plistToForm', () => {
  it('maps every managed key from the full fixture', () => {
    const f = plistToForm(fixture)
    expect(f.label).toBe('com.agentdesk.test.full')
    expect(f.program).toBe('')
    expect(f.programArguments).toEqual(['/bin/sh', '-c', 'echo "hi & bye" > /dev/null'])
    expect(f.runAtLoad).toBe('true')
    expect(f.keepAlive).toEqual({
      mode: 'conditional',
      successfulExit: 'false',
      crashed: 'unset',
      other: { PathState: { '/tmp/agentdesk-flag': true } }
    })
    expect(f.startInterval).toBe('300')
    expect(f.startCalendarInterval).toEqual([
      { ...emptyCalendarEntry(), hour: '9', minute: '0' },
      { ...emptyCalendarEntry(), weekday: '1' }
    ])
    expect(f.calendarAsArray).toBe(true)
    expect(f.watchPaths).toEqual(['/tmp/agentdesk-watch'])
    expect(f.workingDirectory).toBe('/tmp')
    expect(f.environmentVariables).toEqual([
      { key: 'PATH', value: '/usr/bin:/bin' },
      { key: 'GREETING', value: 'ciao è ü 🚀' }
    ])
    expect(f.standardOutPath).toBe('/tmp/agentdesk.out.log')
    expect(f.standardErrorPath).toBe('/tmp/agentdesk.err.log')
    expect(f.unsupported).toEqual([])
    expect(Object.keys(f.extra)).toEqual([
      'Nice',
      'ExitTimeOut',
      'Created',
      'Blob',
      'EmptyDict',
      'EmptyArray',
      'EmptyString'
    ])
  })

  it('maps Program, booleans and a single calendar dict', () => {
    const f = plistToForm({
      Label: 'com.example.a',
      Program: '/usr/bin/true',
      RunAtLoad: false,
      KeepAlive: true,
      StartCalendarInterval: { Hour: 3 }
    })
    expect(f.program).toBe('/usr/bin/true')
    expect(f.runAtLoad).toBe('false')
    expect(f.keepAlive.mode).toBe('always')
    expect(f.startCalendarInterval).toEqual([{ ...emptyCalendarEntry(), hour: '3' }])
    expect(f.calendarAsArray).toBe(false)
    expect(plistToForm({ KeepAlive: false }).keepAlive.mode).toBe('never')
  })

  it.each([
    ['Label', 42],
    ['Label', ''],
    ['Program', ['/bin/true']],
    ['ProgramArguments', '/bin/true'],
    ['ProgramArguments', []],
    ['ProgramArguments', ['/bin/sh', 1]],
    ['RunAtLoad', 'yes'],
    ['KeepAlive', {}],
    ['KeepAlive', { SuccessfulExit: 'no' }],
    ['KeepAlive', 1],
    ['StartInterval', '300'],
    ['StartInterval', 2.5],
    ['StartInterval', -1],
    ['StartCalendarInterval', []],
    ['StartCalendarInterval', { Hour: '9' }],
    ['StartCalendarInterval', { Hour: 9, Second: 1 }],
    ['StartCalendarInterval', [{ Hour: 9 }, 'x']],
    ['WatchPaths', []],
    ['WorkingDirectory', ''],
    ['EnvironmentVariables', {}],
    ['EnvironmentVariables', { N: 1 }],
    ['StandardOutPath', true]
  ])('keeps unsupported %s = %j raw in extra', (key, value) => {
    const data = { Label: 'com.example.a', Program: '/bin/true', [key]: value } as PlistDict
    const f = plistToForm(data)
    expect(f.unsupported).toEqual([key])
    expect(f.extra[key]).toEqual(value)
  })
})

describe('round-trip', () => {
  it('returns the full fixture unchanged, in the same key order', () => {
    const out = roundTrip(fixture)
    expect(out).toEqual(fixture)
    expect(Object.keys(out)).toEqual(Object.keys(fixture))
    expect(out.Created).toBeInstanceOf(Date)
  })

  it.each<[string, PlistDict]>([
    ['minimal', { Label: 'com.example.a', Program: '/bin/true' }],
    ['explicit false', { Label: 'a', Program: '/bin/true', RunAtLoad: false, KeepAlive: false }],
    ['single calendar dict', { Label: 'a', Program: '/x', StartCalendarInterval: { Minute: 5 } }],
    ['one-entry calendar array', { Label: 'a', Program: '/x', StartCalendarInterval: [{}] }],
    [
      'unsupported managed values',
      { Label: 'a', Program: '/x', StartInterval: '60', WatchPaths: [] }
    ],
    ['Program and ProgramArguments', { Label: 'a', Program: '/x', ProgramArguments: ['x', '-v'] }],
    ['empty env value', { Label: 'a', Program: '/x', EnvironmentVariables: { A: '' } }],
    [
      'keys out of canonical order',
      { StandardOutPath: '/tmp/o', Disabled: true, Program: '/x', Label: 'a' }
    ]
  ])('%s', (_name, data) => {
    const out = roundTrip(data)
    expect(out).toEqual(data)
    expect(Object.keys(out)).toEqual(Object.keys(data))
  })
})

describe('formToPlist', () => {
  it('writes new keys in canonical order, after existing ones', () => {
    const f = plistToForm({ Label: 'com.example.a', Custom: 1, Program: '/bin/true' })
    f.standardErrorPath = '/tmp/e'
    f.runAtLoad = 'true'
    const result = formToPlist(f)
    expect(result.ok && Object.keys(result.data)).toEqual([
      'Label',
      'Custom',
      'Program',
      'RunAtLoad',
      'StandardErrorPath'
    ])
  })

  it('drops cleared fields', () => {
    const f = plistToForm(fixture)
    f.watchPaths = []
    f.startCalendarInterval = []
    f.keepAlive.mode = 'unset'
    f.environmentVariables = []
    f.startInterval = ''
    const result = formToPlist(f)
    if (!result.ok) throw new Error('expected ok')
    for (const key of [
      'WatchPaths',
      'StartCalendarInterval',
      'KeepAlive',
      'EnvironmentVariables',
      'StartInterval'
    ]) {
      expect(result.data).not.toHaveProperty(key)
    }
    expect(result.data.Nice).toBe(-5)
  })

  it('a filled field overrides the raw unsupported value', () => {
    const f = plistToForm({ Label: 'a', Program: '/x', StartInterval: '60' })
    f.startInterval = ' 90 '
    const result = formToPlist(f)
    expect(result.ok && result.data.StartInterval).toBe(90)
  })

  it('writes calendar entries as integers, skipping blanks', () => {
    const result = formToPlist(
      form({
        startCalendarInterval: [{ ...emptyCalendarEntry(), hour: '07', weekday: '0' }],
        calendarAsArray: false
      })
    )
    expect(result.ok && result.data.StartCalendarInterval).toEqual({ Hour: 7, Weekday: 0 })
  })

  it('writes conditional KeepAlive with known and other conditions', () => {
    const result = formToPlist(
      form({
        keepAlive: {
          mode: 'conditional',
          successfulExit: 'false',
          crashed: 'true',
          other: { OtherJobEnabled: { 'com.x': true } }
        }
      })
    )
    expect(result.ok && result.data.KeepAlive).toEqual({
      SuccessfulExit: false,
      Crashed: true,
      OtherJobEnabled: { 'com.x': true }
    })
  })

  it('returns field errors instead of data for an invalid form', () => {
    const result = formToPlist(form({ label: '', startInterval: 'soon' }))
    expect(result).toEqual({
      ok: false,
      errors: {
        label: 'Label is required',
        startInterval: 'Enter a whole number of seconds (1 or more)'
      }
    })
  })

  it('does not mutate the form', () => {
    const f = plistToForm(fixture)
    const snapshot = structuredClone(f)
    formToPlist(f)
    expect(f).toEqual(snapshot)
  })
})

describe('validateAgentForm', () => {
  it('accepts a minimal valid form and the full fixture', () => {
    expect(errorsOf({})).toEqual({})
    expect(validateAgentForm(plistToForm(fixture))).toEqual({})
  })

  it('validates the label', () => {
    expect(errorsOf({ label: '' }).label).toBe('Label is required')
    expect(errorsOf({ label: 'bad label' }).label).toMatch(/letters, digits/)
    expect(errorsOf({ label: 'com.example.' }).label).toBeDefined()
  })

  it('does not require a label kept raw in extra', () => {
    const f = plistToForm({ Label: 42, Program: '/x' })
    expect(validateAgentForm(f).label).toBeUndefined()
  })

  it('requires Program or ProgramArguments', () => {
    expect(errorsOf({ program: '' }).program).toBe('Set Program or ProgramArguments')
    expect(errorsOf({ program: '', programArguments: ['sleep', '1'] })).toEqual({})
    expect(errorsOf({ program: '', programArguments: [''] })['programArguments.0']).toMatch(
      /executable/
    )
    expect(errorsOf({ programArguments: [''] })).toEqual({})
  })

  it('requires absolute paths', () => {
    expect(errorsOf({ program: 'bin/true' }).program).toBe('Must be an absolute path')
    expect(errorsOf({ standardOutPath: '~/out.log' }).standardOutPath).toMatch(/~/)
    expect(errorsOf({ workingDirectory: 'tmp' }).workingDirectory).toBeDefined()
    expect(errorsOf({ standardErrorPath: 'err' }).standardErrorPath).toBeDefined()
    expect(errorsOf({ watchPaths: ['/ok', 'rel', ''] })).toEqual({
      'watchPaths.1': 'Must be an absolute path',
      'watchPaths.2': 'Path cannot be empty'
    })
  })

  it('rejects NUL characters', () => {
    expect(errorsOf({ programArguments: ['a\0b'] })['programArguments.0']).toMatch(/NUL/)
    expect(errorsOf({ program: '/bin/\0' }).program).toMatch(/NUL/)
  })

  it.each(['0', '-5', '1.5', 'abc', String(2 ** 31)])('rejects StartInterval %s', (value) => {
    expect(errorsOf({ startInterval: value }).startInterval).toBeDefined()
  })

  it('accepts StartInterval 1 and blank', () => {
    expect(errorsOf({ startInterval: '1' })).toEqual({})
    expect(errorsOf({ startInterval: '  ' })).toEqual({})
  })

  it('checks calendar ranges per field', () => {
    const errors = errorsOf({
      startCalendarInterval: [
        { minute: '59', hour: '23', day: '31', weekday: '7', month: '12' },
        { minute: '60', hour: '24', day: '0', weekday: '8', month: '13' },
        { ...emptyCalendarEntry(), hour: 'x' }
      ]
    })
    expect(Object.keys(errors).sort()).toEqual([
      'startCalendarInterval.1.day',
      'startCalendarInterval.1.hour',
      'startCalendarInterval.1.minute',
      'startCalendarInterval.1.month',
      'startCalendarInterval.1.weekday',
      'startCalendarInterval.2.hour'
    ])
    expect(errors['startCalendarInterval.1.day']).toBe('Enter 1–31, or leave blank for any')
  })

  it('requires a condition for conditional KeepAlive', () => {
    const keepAlive = {
      mode: 'conditional',
      successfulExit: 'unset',
      crashed: 'unset',
      other: {}
    } as const
    expect(errorsOf({ keepAlive }).keepAlive).toBe('Pick at least one condition')
    expect(errorsOf({ keepAlive: { ...keepAlive, crashed: 'true' } })).toEqual({})
  })

  it('validates environment variable names', () => {
    expect(
      errorsOf({
        environmentVariables: [
          { key: 'OK_1', value: '' },
          { key: '', value: 'x' },
          { key: '1BAD', value: 'x' },
          { key: 'OK_1', value: 'dup' },
          { key: 'V', value: 'a\0' }
        ]
      })
    ).toEqual({
      'environmentVariables.1.key': 'Name is required',
      'environmentVariables.2.key': 'Use letters, digits and _; do not start with a digit',
      'environmentVariables.3.key': 'Duplicate variable OK_1',
      'environmentVariables.4.value': 'Contains a NUL character'
    })
  })
})
