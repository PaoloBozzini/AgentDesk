import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseDisabledBlock, parseDomainPrint } from './domainParser'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', `${name}.txt`), 'utf8')

describe('parseDomainPrint', () => {
  const { services, overrides } = parseDomainPrint(fixture('domain-gui'))

  it('reads every service row and nothing from other blocks', () => {
    expect(services.size).toBe(12)
    expect(services.has('com.apple.xpc.launchd.unmanaged.loginwindow.370')).toBe(false)
  })

  it('running service: pid, never exited', () => {
    expect(services.get('com.agentdesk.test.running')).toEqual({
      label: 'com.agentdesk.test.running',
      pid: 3191,
      statusText: '-'
    })
  })

  it('not running: pid omitted, exit status parsed (signals negative)', () => {
    expect(services.get('com.agentdesk.test.exited')).toEqual({
      label: 'com.agentdesk.test.exited',
      lastExitStatus: 0,
      statusText: '0'
    })
    expect(services.get('com.agentdesk.test.killed')?.lastExitStatus).toBe(-9)
    expect(services.get('com.agentdesk.test.badpath')?.lastExitStatus).toBe(78)
  })

  it('keeps unknown status tokens raw', () => {
    expect(services.get('com.apple.syncdefaultsd')).toEqual({
      label: 'com.apple.syncdefaultsd',
      pid: 1344,
      statusText: '(pe)'
    })
  })

  it('handles @ and long labels', () => {
    expect(services.has('homebrew.mxcl.postgresql@14')).toBe(true)
    expect(
      services.get(
        'com.example.helper.cc24aef4a1b90ed56a725c38014c95072f92651fb65e1bf9c8e43c37a23d420d'
      )?.lastExitStatus
    ).toBe(111)
  })

  it('reads the disabled services block', () => {
    expect(overrides?.get('com.agentdesk.test.never')).toBe(true)
    expect(overrides?.get('com.agentdesk.test.exited')).toBe(false)
    expect(overrides?.has('com.agentdesk.test.running')).toBe(false)
  })

  it.each([
    ['empty', ''],
    ['error text', 'Bad request.'],
    ['no services block', 'gui/501 = {\n\ttype = login\n}'],
    ['unbalanced', 'gui/501 = {\n\tservices = {\n\t\t0 0 a\n']
  ])('never throws on %s', (_n, text) => {
    expect(() => parseDomainPrint(text)).not.toThrow()
  })

  it('skips malformed rows', () => {
    const { services, overrides } = parseDomainPrint(
      'x = {\n\tservices = {\n\t\tgarbage\n\t\t0 0 ok\n\t}\n\tdisabled services = {\n\t\tnot a pair\n\t}\n}'
    )
    expect([...services.keys()]).toEqual(['ok'])
    expect(overrides?.size).toBe(0)
  })

  it('returns undefined overrides when the block is missing', () => {
    expect(parseDomainPrint('gui/501 = {\n}').overrides).toBeUndefined()
  })
})

describe('parseDisabledBlock', () => {
  it('parses print-disabled output', () => {
    const o = parseDisabledBlock(fixture('print-disabled'))
    expect(o?.get('com.agentdesk.test.never')).toBe(true)
    expect(o?.get('com.google.keystone.user.xpcservice')).toBe(false)
    expect(o?.size).toBe(3)
  })

  it('understands the legacy true/false form', () => {
    const o = parseDisabledBlock(fixture('print-disabled-legacy'))
    expect(o?.get('com.example.a')).toBe(true)
    expect(o?.get('com.example.b')).toBe(false)
  })

  it('ignores unknown values', () => {
    expect(parseDisabledBlock('disabled services = {\n"a" => maybe\n}')?.size).toBe(0)
  })
})
