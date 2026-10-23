import { describe, expect, it } from 'vitest'
import { LabelError } from '../../../shared/label'
import { mergeByTime } from '../../../shared/log-sort'
import type { UnifiedLogLine } from '../../../shared/log-types'
import {
  buildPredicate,
  executableOf,
  isLogWindow,
  LineSplitter,
  logShowArgs,
  parseLogLine,
  predicateString
} from './unifiedLog'

const LD = '(process == "launchd" AND eventMessage CONTAINS "com.a.b")'

describe('predicateString', () => {
  it('quotes and escapes', () => {
    expect(predicateString('plain')).toBe('"plain"')
    expect(predicateString('a"b\\c')).toBe('"a\\"b\\\\c"')
  })
})

describe('executableOf', () => {
  it('prefers Program, then ProgramArguments[0]', () => {
    expect(executableOf({ Program: '/a', ProgramArguments: ['/b'] })).toBe('/a')
    expect(executableOf({ ProgramArguments: ['/b', 'x'] })).toBe('/b')
    expect(executableOf({})).toBeUndefined()
    expect(executableOf({ ProgramArguments: [] })).toBeUndefined()
  })
})

describe('buildPredicate', () => {
  it('launchd messages about the label, and the executable name, as separate parts', () => {
    expect(
      buildPredicate('com.a.b', { ProgramArguments: ['/usr/local/bin/backup', '--x'] })
    ).toEqual({
      parts: [LD, 'process == "backup"'],
      predicate: `${LD} OR process == "backup"`,
      note: 'Also shows anything logged by processes named “backup”.'
    })
    expect(buildPredicate('com.a.b', { Program: 'backupd' }).parts[1]).toBe('process == "backupd"')
  })

  it('escapes odd characters in the name', () => {
    expect(buildPredicate('com.a.b', { Program: '/Apps/My "App"' }).parts[1]).toBe(
      'process == "My \\"App\\""'
    )
  })

  it.each([
    '/bin/sh',
    '/bin/zsh',
    '/usr/bin/python3',
    '/opt/homebrew/bin/python3.12',
    '/usr/bin/open',
    'node'
  ])('skips the generic executable %s with a note', (exe) => {
    const q = buildPredicate('com.a.b', { ProgramArguments: [exe, 'script'] })
    expect(q).toMatchObject({ parts: [LD], predicate: LD })
    expect(q.note).toMatch(/only launchd messages/)
  })

  it('launchd only when there is no program', () => {
    expect(buildPredicate('com.a.b', {})).toMatchObject({ parts: [LD], predicate: LD })
  })

  it('rejects invalid labels', () => {
    expect(() => buildPredicate('a" OR 1 == 1', {})).toThrow(LabelError)
  })
})

describe('mergeByTime', () => {
  const at = (timestamp: string, message: string): UnifiedLogLine => ({
    timestamp,
    process: 'p',
    level: 'Default',
    message
  })

  it('interleaves groups chronologically', () => {
    const a = [
      at('2026-10-23 10:00:01.000000+0200', 'a1'),
      at('2026-10-23 10:00:03.000000+0200', 'a2')
    ]
    const b = [at('2026-10-23 10:00:02.000000+0200', 'b1')]
    expect(mergeByTime(a, b).map((l) => l.message)).toEqual(['a1', 'b1', 'a2'])
    expect(mergeByTime()).toEqual([])
  })
})

describe('logShowArgs', () => {
  it('is an argv array with the predicate as one argument', () => {
    expect(logShowArgs('1h', 'X == "y"')).toEqual([
      'show',
      '--last',
      '1h',
      '--style',
      'ndjson',
      '--predicate',
      'X == "y"'
    ])
  })

  it('validates windows', () => {
    expect(isLogWindow('15m')).toBe(true)
    expect(isLogWindow('7d')).toBe(false)
  })
})

describe('parseLogLine (real ndjson shapes)', () => {
  it('parses a log event', () => {
    const line = JSON.stringify({
      eventType: 'logEvent',
      messageType: 'Error',
      subsystem: 'com.google.GoogleUpdater',
      category: 'net',
      processImagePath: '/Applications/X.app/Contents/MacOS/GoogleUpdater',
      processID: 22554,
      timestamp: '2026-10-23 22:40:24.714501+0200',
      eventMessage: 'Retrieve User by ID'
    })
    expect(parseLogLine(line)).toEqual({
      timestamp: '2026-10-23 22:40:24.714501+0200',
      process: 'GoogleUpdater',
      pid: 22554,
      level: 'Error',
      subsystem: 'com.google.GoogleUpdater',
      category: 'net',
      message: 'Retrieve User by ID'
    })
  })

  it('drops empty subsystem/category', () => {
    const p = parseLogLine(
      JSON.stringify({ eventType: 'logEvent', eventMessage: 'm', subsystem: '', category: '' })
    )
    expect(p).toMatchObject({
      subsystem: undefined,
      category: undefined,
      process: '?',
      level: 'Default'
    })
  })

  it.each([
    ['activity events', JSON.stringify({ eventType: 'activityCreateEvent', eventMessage: 'x' })],
    ['the final summary', '{"count":361,"finished":1}'],
    ['the stream banner', 'Filtering the log data using "process == ..."'],
    ['broken json', '{"eventType":'],
    ['blank', '   ']
  ])('ignores %s', (_n, line) => {
    expect(parseLogLine(line)).toBeNull()
  })
})

describe('LineSplitter', () => {
  it('reassembles lines split across chunks', () => {
    const s = new LineSplitter()
    expect(s.push('{"a":')).toEqual([])
    expect(s.push('1}\n{"b"')).toEqual(['{"a":1}'])
    expect(s.push(':2}\n')).toEqual(['{"b":2}'])
    expect(s.push('tail')).toEqual([])
    expect(s.flush()).toEqual(['tail'])
    expect(s.flush()).toEqual([])
  })
})
