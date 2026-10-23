import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import type { AgentSummary } from '../../shared/agent-types'
import { parseDomainPrint } from './launchctl/domainParser'
import { Launchctl, type ExecFn } from './launchctl/runner'
import { attachRuntime, readDomains, runtimeFor } from './status'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, 'launchctl', '__fixtures__', `${name}.txt`), 'utf8')

const gui = parseDomainPrint(fixture('domain-gui'))

const agent = (label: string | undefined, extra: Partial<AgentSummary> = {}): AgentSummary => ({
  path: `/x/${label}.plist`,
  fileName: `${label}.plist`,
  scope: 'user',
  readOnly: false,
  label,
  labelMismatch: false,
  ...extra
})

describe('runtimeFor', () => {
  it('running agent', () => {
    expect(runtimeFor(agent('com.agentdesk.test.running'), gui)).toEqual({
      loaded: true,
      running: true,
      pid: 3191,
      lastExitStatus: undefined,
      statusText: '-',
      enabled: true,
      enabledSource: 'default'
    })
  })

  it('loaded, exited with failure, signal', () => {
    expect(runtimeFor(agent('com.agentdesk.test.failed'), gui)).toMatchObject({
      loaded: true,
      running: false,
      lastExitStatus: 1
    })
    expect(runtimeFor(agent('com.agentdesk.test.killed'), gui)?.lastExitStatus).toBe(-9)
  })

  it('not loaded', () => {
    expect(runtimeFor(agent('com.nope'), gui)).toEqual({
      loaded: false,
      running: false,
      enabled: true,
      enabledSource: 'default'
    })
  })

  it('override beats the plist Disabled key', () => {
    expect(
      runtimeFor(agent('com.agentdesk.test.never', { disabledKey: false }), gui)
    ).toMatchObject({
      enabled: false,
      enabledSource: 'override'
    })
    expect(
      runtimeFor(agent('com.agentdesk.test.exited', { disabledKey: true }), gui)
    ).toMatchObject({
      enabled: true,
      enabledSource: 'override'
    })
  })

  it('falls back to the plist Disabled key', () => {
    expect(runtimeFor(agent('com.nope', { disabledKey: true }), gui)).toMatchObject({
      enabled: false,
      enabledSource: 'plist'
    })
  })

  it('unknown without a label or a domain', () => {
    expect(runtimeFor(agent(undefined), gui)).toBeUndefined()
    expect(runtimeFor(agent('com.agentdesk.test.running'), undefined)).toBeUndefined()
  })
})

describe('attachRuntime', () => {
  it('uses the system domain for daemons and gui for agents', () => {
    const system = parseDomainPrint(
      'system = {\n\tservices = {\n\t\t548 - com.docker.vmnetd\n\t}\n}'
    )
    const [user, daemon, globalAgent] = attachRuntime(
      [
        agent('com.agentdesk.test.running'),
        agent('com.docker.vmnetd', { scope: 'global-daemon', readOnly: true }),
        agent('com.agentdesk.test.exited', { scope: 'global-agent', readOnly: true })
      ],
      { gui, system }
    )
    expect(user.runtime?.pid).toBe(3191)
    expect(daemon.runtime?.pid).toBe(548)
    expect(globalAgent.runtime?.lastExitStatus).toBe(0)
  })

  it('leaves daemons without runtime when the system domain was not read', () => {
    const [daemon] = attachRuntime([agent('x', { scope: 'global-daemon' })], { gui })
    expect(daemon.runtime).toBeUndefined()
  })
})

describe('readDomains', () => {
  const ok = (stdout: string): ReturnType<ExecFn> =>
    Promise.resolve({ stdout, stderr: '', code: 0, signal: null, timedOut: false })

  it('reads gui only by default, with overrides from the same call', async () => {
    const exec = vi.fn<ExecFn>().mockImplementation(() => ok(fixture('domain-gui')))
    const d = await readDomains(new Launchctl({ uid: 501, exec }), false)
    expect(exec).toHaveBeenCalledTimes(1)
    expect(exec.mock.calls[0][1]).toEqual(['print', 'gui/501'])
    expect(d.system).toBeUndefined()
    expect(d.gui.overrides?.get('com.agentdesk.test.never')).toBe(true)
  })

  it('falls back to print-disabled and reads system when asked', async () => {
    const exec = vi
      .fn<ExecFn>()
      .mockImplementation((_f, args) =>
        ok(
          args[0] === 'print-disabled'
            ? fixture('print-disabled')
            : args[1] === 'system'
              ? 'system = {\n\tservices = {\n\t}\n}'
              : 'gui/501 = {\n\tservices = {\n\t\t0 0 a\n\t}\n}'
        )
      )
    const d = await readDomains(new Launchctl({ uid: 501, exec }), true)
    expect(exec.mock.calls.map((c) => c[1])).toEqual([
      ['print', 'gui/501'],
      ['print-disabled', 'gui/501'],
      ['print', 'system']
    ])
    expect(d.gui.overrides?.get('com.agentdesk.test.never')).toBe(true)
    expect(d.system?.services.size).toBe(0)
  })
})
