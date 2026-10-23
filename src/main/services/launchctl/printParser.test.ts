import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parsePrintService } from './printParser'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', `print-${name}.txt`), 'utf8')

describe('parsePrintService (real macOS 14 output)', () => {
  it('running', () => {
    const s = parsePrintService(fixture('running'))
    expect(s).toMatchObject({
      label: 'com.agentdesk.test.running',
      state: 'running',
      running: true,
      pid: 3191,
      runs: 1,
      neverExited: true,
      program: '/bin/sleep',
      arguments: ['/bin/sleep', '600'],
      path: '/Users/tester/Library/LaunchAgents/com.agentdesk.test.running.plist',
      type: 'LaunchAgent'
    })
    expect(s.lastExitCode).toBeUndefined()
  })

  it('exited cleanly', () => {
    const s = parsePrintService(fixture('exited'))
    expect(s).toMatchObject({
      running: false,
      state: 'not running',
      lastExitCode: 0,
      neverExited: false,
      runs: 1,
      stdoutPath: '/tmp/agentdesk-test.out.log'
    })
    expect(s.pid).toBeUndefined()
    expect(s.arguments).toBeUndefined()
  })

  it('failed with exit code', () => {
    expect(parsePrintService(fixture('failed'))).toMatchObject({ lastExitCode: 1, running: false })
  })

  it('killed by a signal (no exit code line)', () => {
    const s = parsePrintService(fixture('killed'))
    expect(s.lastSignal).toEqual({ name: 'Killed', number: 9 })
    expect(s.lastExitCode).toBeUndefined()
    expect(s.neverExited).toBe(false)
  })

  it('never ran', () => {
    expect(parsePrintService(fixture('never'))).toMatchObject({
      runs: 0,
      neverExited: true,
      running: false
    })
  })

  it('spawn failure with reason', () => {
    expect(parsePrintService(fixture('badpath'))).toMatchObject({
      state: 'spawn scheduled',
      running: false,
      lastExitCode: 78,
      lastExitReason: 'EX_CONFIG',
      program: '/nonexistent/agentdesk'
    })
  })

  it('does not pick up nested pid/state from event triggers or sub-blocks', () => {
    const s = parsePrintService(fixture('exited'))
    expect(s.fields['state']).toBe('not running')
  })
})

describe('parsePrintService (robustness)', () => {
  it('handles a minimal block', () => {
    expect(parsePrintService(fixture('minimal'))).toEqual({
      label: 'com.agentdesk.test.minimal',
      state: 'waiting',
      running: false,
      neverExited: false,
      fields: { state: 'waiting' }
    })
  })

  it('ignores nested blocks, bad numbers and unknown fields', () => {
    const s = parsePrintService(fixture('future'))
    expect(s.pid).toBe(4242)
    expect(s.runs).toBeUndefined()
    expect(s.lastExitCode).toBe(3)
    expect(s.lastExitReason).toBe('some future description')
    expect(s.arguments).toEqual([])
    expect(s.fields['some new field']).toBe('with = equals')
  })

  it.each([
    ['empty', ''],
    ['garbage', 'Bad request.\nCould not find service'],
    ['unbalanced', 'gui/501/x = {\n\tstate = running\n\targuments = {\n\t\t/bin/x\n']
  ])('never throws on %s input', (_n, text) => {
    expect(() => parsePrintService(text)).not.toThrow()
  })

  it('accepts CRLF and space indentation', () => {
    const s = parsePrintService('gui/501/x = {\r\n    state = running\r\n    pid = 5\r\n}\r\n')
    expect(s).toMatchObject({ label: 'x', running: true, pid: 5 })
  })

  it('leaves a non-numeric exit code undefined', () => {
    const s = parsePrintService('x = {\n\tlast exit code = (unknown)\n}')
    expect(s.lastExitCode).toBeUndefined()
    expect(s.neverExited).toBe(false)
    expect(s.fields['last exit code']).toBe('(unknown)')
  })

  it('parses a signal without a number', () => {
    const s = parsePrintService('x = {\n\tlast terminating signal = Terminated\n}')
    expect(s.lastSignal).toEqual({ name: 'Terminated' })
  })
})
