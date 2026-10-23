import { describe, expect, it, vi } from 'vitest'
import { LabelError } from '../../../shared/label'
import {
  execFileAsync,
  LAUNCHCTL,
  Launchctl,
  LaunchctlCommands,
  LaunchctlError,
  type ExecFn,
  type ExecResult
} from './runner'

const ok = (stdout = ''): ExecResult => ({
  stdout,
  stderr: '',
  code: 0,
  signal: null,
  timedOut: false
})

describe('LaunchctlCommands', () => {
  const c = new LaunchctlCommands(501)

  it('uses the gui/<uid> domain with modern syntax', () => {
    expect(c.printDomain()).toEqual(['print', 'gui/501'])
    expect(c.printService('com.a.b')).toEqual(['print', 'gui/501/com.a.b'])
    expect(c.printDisabled()).toEqual(['print-disabled', 'gui/501'])
    expect(c.bootstrap('/Users/x/Library/LaunchAgents/com.a.b.plist')).toEqual([
      'bootstrap',
      'gui/501',
      '/Users/x/Library/LaunchAgents/com.a.b.plist'
    ])
    expect(c.bootout('com.a.b')).toEqual(['bootout', 'gui/501/com.a.b'])
    expect(c.kickstart('com.a.b')).toEqual(['kickstart', 'gui/501/com.a.b'])
    expect(c.kickstart('com.a.b', true)).toEqual(['kickstart', '-k', 'gui/501/com.a.b'])
    expect(c.enable('com.a.b')).toEqual(['enable', 'gui/501/com.a.b'])
    expect(c.disable('com.a.b')).toEqual(['disable', 'gui/501/com.a.b'])
  })

  it.each([
    ['flag-like', '-k'],
    ['traversal', '../x'],
    ['shell', 'a;rm -rf ~'],
    ['domain injection', 'com.a/../../system/x']
  ])('rejects %s labels before building args', (_n, label) => {
    expect(() => c.bootout(label)).toThrow(LabelError)
    expect(() => c.kickstart(label, true)).toThrow(LabelError)
  })

  it('rejects relative or NUL bootstrap paths', () => {
    expect(() => c.bootstrap('x.plist')).toThrow()
    expect(() => c.bootstrap('/a\0b.plist')).toThrow()
  })

  it('rejects invalid uids', () => {
    expect(() => new LaunchctlCommands(-1)).toThrow()
    expect(() => new LaunchctlCommands(1.5)).toThrow()
  })
})

describe('Launchctl.run', () => {
  it('calls /bin/launchctl with the argument array and returns stdout', async () => {
    const exec = vi.fn<ExecFn>().mockResolvedValue(ok('hello'))
    const lc = new Launchctl({ uid: 501, exec, timeoutMs: 1234 })
    await expect(lc.run(['print', 'gui/501'])).resolves.toBe('hello')
    expect(exec).toHaveBeenCalledWith(LAUNCHCTL, ['print', 'gui/501'], 1234)
  })

  it('throws LaunchctlError carrying raw stderr and exit code', async () => {
    const exec = vi.fn<ExecFn>().mockResolvedValue({
      stdout: '',
      stderr: 'Bad request.\nCould not find service "x" in domain for user gui: 501\n',
      code: 113,
      signal: null,
      timedOut: false
    })
    const lc = new Launchctl({ uid: 501, exec })
    const err = await lc.run(['print', 'gui/501/x']).catch((e) => e)
    expect(err).toBeInstanceOf(LaunchctlError)
    expect(err.code).toBe(113)
    expect(err.stderr).toContain('Bad request.')
    expect(err.isServiceNotFound).toBe(true)
    expect(err.message).toBe(
      'launchctl print exited with code 113: Could not find service "x" in domain for user gui: 501'
    )
  })

  it('reports timeouts', async () => {
    const exec = vi.fn<ExecFn>().mockResolvedValue({
      stdout: '',
      stderr: '',
      code: null,
      signal: 'SIGTERM',
      timedOut: true
    })
    const err = await new Launchctl({ uid: 501, exec }).run(['print', 'gui/501']).catch((e) => e)
    expect(err.timedOut).toBe(true)
    expect(err.message).toBe('launchctl print timed out')
  })
})

describe('execFileAsync', () => {
  it('captures stdout and exit code without a shell', async () => {
    const r = await execFileAsync('/bin/echo', ['a;b', '$HOME'], 5000)
    expect(r).toMatchObject({ stdout: 'a;b $HOME\n', code: 0, timedOut: false })
  })

  it('captures non-zero exit codes and stderr', async () => {
    const r = await execFileAsync('/bin/ls', ['/nonexistent-agentdesk'], 5000)
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/No such file/)
  })

  it('times out', async () => {
    const r = await execFileAsync('/bin/sleep', ['5'], 100)
    expect(r.timedOut).toBe(true)
  })

  it('reports a missing binary', async () => {
    const r = await execFileAsync('/nonexistent/bin', [], 1000)
    expect(r.code).toBeNull()
    expect(r.stderr).toMatch(/ENOENT/)
  })
})
