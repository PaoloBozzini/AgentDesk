import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { userAgentsDir, type AgentDir } from './agents'
import { controlAgent } from './control'
import { Launchctl, type ExecFn, type ExecResult } from './launchctl/runner'
import { serializePlist } from './plist'

const LABEL = 'com.agentdesk.test.ctl'

/** Minimal launchd simulation, mirroring behaviour observed on macOS 14.7. */
class FakeLaunchd {
  loaded = new Set<string>()
  disabled = new Set<string>()
  calls: string[][] = []
  /** Number of `print <service>` calls that still report the service after bootout. */
  lingerAfterBootout = 0
  private lingering = new Set<string>()

  exec: ExecFn = async (_file, args) => {
    this.calls.push(args)
    const res = (code: number, stdout = '', stderr = ''): ExecResult => ({
      stdout,
      stderr,
      code,
      signal: null,
      timedOut: false
    })
    const [cmd, ...rest] = args
    const target = rest[rest.length - 1]
    const label = target.split('/').slice(2).join('/')
    switch (cmd) {
      case 'print':
        if (rest[0] === 'gui/501') {
          const services = [...this.loaded].map((l) => `\t\t0 - ${l}`).join('\n')
          const disabled = [...this.disabled].map((l) => `\t\t"${l}" => disabled`).join('\n')
          return res(
            0,
            `gui/501 = {\n\tservices = {\n${services}\n\t}\n\tdisabled services = {\n${disabled}\n\t}\n}`
          )
        }
        if (this.lingering.has(label)) {
          if (this.lingerAfterBootout > 0) {
            this.lingerAfterBootout--
            return res(0, `${target} = {\n\tstate = running\n}`)
          }
          this.lingering.delete(label)
        }
        if (this.loaded.has(label)) return res(0, `${target} = {\n\tstate = running\n}`)
        return res(113, '', `Could not find service "${label}" in domain for user gui: 501`)
      case 'bootstrap': {
        const l = LABEL
        if (this.loaded.has(l) || this.lingering.has(l) || this.disabled.has(l)) {
          return res(5, '', 'Bootstrap failed: 5: Input/output error')
        }
        this.loaded.add(l)
        return res(0)
      }
      case 'bootout':
        if (!this.loaded.delete(label)) return res(3, '', 'Boot-out failed: 3: No such process')
        if (this.lingerAfterBootout > 0) this.lingering.add(label)
        return res(0)
      case 'kickstart':
        return this.loaded.has(label)
          ? res(0)
          : res(113, '', `Could not find service "${label}" in domain for user gui: 501`)
      case 'enable':
        this.disabled.delete(label)
        return res(0)
      case 'disable':
        this.disabled.add(label)
        return res(0)
    }
    return res(64, '', 'unknown')
  }
}

let base: string
let dirs: AgentDir[]
let file: string
let launchd: FakeLaunchd
let launchctl: Launchctl

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'agentdesk-ctl-'))
  const dir = userAgentsDir(base)
  await mkdir(dir, { recursive: true })
  dirs = [{ dir, scope: 'user' }]
  file = join(dir, `${LABEL}.plist`)
  await writeFile(file, serializePlist({ Label: LABEL, Program: '/usr/bin/true' }))
  launchd = new FakeLaunchd()
  launchctl = new Launchctl({ uid: 501, exec: launchd.exec })
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

const act = (
  action: Parameters<typeof controlAgent>[1],
  path: unknown = file
): ReturnType<typeof controlAgent> =>
  controlAgent(path, action, { launchctl, writableDirs: dirs, sleep: async () => {} })

describe('controlAgent', () => {
  it('loads with bootstrap gui/<uid> <path>', async () => {
    await expect(act('load')).resolves.toEqual({ ok: true })
    expect(launchd.calls.at(-1)).toEqual(['bootstrap', 'gui/501', file])
    expect(launchd.loaded.has(LABEL)).toBe(true)
  })

  it('refuses to load twice with a clear reason, without calling bootstrap', async () => {
    launchd.loaded.add(LABEL)
    const r = await act('load')
    expect(r).toMatchObject({ ok: false, error: { summary: 'Already loaded' } })
    expect(launchd.calls.some((c) => c[0] === 'bootstrap')).toBe(false)
  })

  it('explains a disabled agent instead of "Input/output error"', async () => {
    launchd.disabled.add(LABEL)
    expect(await act('load')).toMatchObject({ ok: false, error: { summary: 'Agent is disabled' } })
  })

  it('maps an unexplained error 5 and keeps raw stderr + command', async () => {
    launchd.exec = (() => {
      const real = launchd.exec
      return async (f, args, t) => {
        if (args[0] === 'bootstrap') {
          return {
            stdout: '',
            stderr: 'Bootstrap failed: 5: Input/output error',
            code: 5,
            signal: null,
            timedOut: false
          }
        }
        return real(f, args, t)
      }
    })()
    launchctl = new Launchctl({ uid: 501, exec: launchd.exec })
    const r = await act('load')
    expect(r).toEqual({
      ok: false,
      error: {
        summary: 'launchd refused to load the agent',
        hint: 'Check the plist (Program path, keys) and the system log.',
        command: ['launchctl', 'bootstrap', 'gui/501', file],
        exitCode: 5,
        stdout: '',
        stderr: 'Bootstrap failed: 5: Input/output error'
      }
    })
  })

  it('unloads with bootout gui/<uid>/<label>', async () => {
    launchd.loaded.add(LABEL)
    expect(await act('unload')).toEqual({ ok: true })
    expect(launchd.calls.at(-1)).toEqual(['bootout', `gui/501/${LABEL}`])
  })

  it('reports "Not loaded" for unload / start of an unloaded agent', async () => {
    expect(await act('unload')).toMatchObject({
      ok: false,
      error: { summary: 'Not loaded', exitCode: 3 }
    })
    expect(await act('start')).toMatchObject({
      ok: false,
      error: { summary: 'Not loaded', hint: 'Load it first.', exitCode: 113 }
    })
  })

  it('start and restart use kickstart [-k]', async () => {
    launchd.loaded.add(LABEL)
    await act('start')
    expect(launchd.calls.at(-1)).toEqual(['kickstart', `gui/501/${LABEL}`])
    await act('restart')
    expect(launchd.calls.at(-1)).toEqual(['kickstart', '-k', `gui/501/${LABEL}`])
  })

  it('gives restart a longer timeout (launchd throttles respawns ~10 s)', async () => {
    launchd.loaded.add(LABEL)
    const timeouts: number[] = []
    const exec = launchd.exec
    launchctl = new Launchctl({
      uid: 501,
      exec: (f, args, t) => {
        if (args[0] === 'kickstart') timeouts.push(t)
        return exec(f, args, t)
      }
    })
    await act('restart')
    await act('start')
    expect(timeouts).toEqual([30_000, 15_000])
  })

  it('enable / disable', async () => {
    await act('disable')
    expect(launchd.disabled.has(LABEL)).toBe(true)
    await act('enable')
    expect(launchd.disabled.has(LABEL)).toBe(false)
  })

  it('reload waits for launchd to forget the service before bootstrapping', async () => {
    launchd.loaded.add(LABEL)
    launchd.lingerAfterBootout = 3
    expect(await act('reload')).toEqual({ ok: true })
    const cmds = launchd.calls.map((c) => c.join(' '))
    const bootout = cmds.indexOf(`bootout gui/501/${LABEL}`)
    const bootstrap = cmds.lastIndexOf(`bootstrap gui/501 ${file}`)
    expect(bootout).toBeGreaterThan(-1)
    expect(
      cmds.slice(bootout + 1, bootstrap).filter((c) => c.startsWith('print gui/501/')).length
    ).toBe(4)
    expect(launchd.loaded.has(LABEL)).toBe(true)
  })

  it('reload of an unloaded agent just bootstraps', async () => {
    expect(await act('reload')).toEqual({ ok: true })
    expect(launchd.calls.some((c) => c[0] === 'bootout')).toBe(false)
  })

  it('reload gives up when the service never goes away', async () => {
    launchd.loaded.add(LABEL)
    launchd.lingerAfterBootout = 1_000_000
    const r = await controlAgent(file, 'reload', {
      launchctl,
      writableDirs: dirs,
      sleep: async () => {},
      unloadTimeoutMs: 0
    })
    expect(r).toMatchObject({ ok: false, error: { summary: 'The agent is still shutting down' } })
  })

  it('refuses files outside the writable folders (system agents) without running launchctl', async () => {
    const r = await act('unload', '/Library/LaunchDaemons/com.docker.vmnetd.plist')
    expect(r).toMatchObject({ ok: false, error: { summary: 'This agent can’t be controlled' } })
    expect(launchd.calls).toEqual([])
  })

  it('refuses a plist without a valid Label', async () => {
    await writeFile(file, serializePlist({ Label: 'bad label;rm' }))
    const r = await act('load')
    expect(r).toMatchObject({ ok: false, error: { summary: 'The plist has no valid Label' } })
    expect(launchd.calls).toEqual([])
  })
})
