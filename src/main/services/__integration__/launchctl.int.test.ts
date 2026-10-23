/**
 * Integration tests against the real launchd. Opt-in: AGENTDESK_INTEGRATION=1.
 *
 * Safety:
 * - every label is `com.agentdesk.test.int.<name>` (stable: enable/disable leave a
 *   permanent entry in launchd's override db, so we reuse names instead of piling up new ones)
 * - plists live in a temp folder (never ~/Library/LaunchAgents)
 * - every launchctl call goes through `guardedExec`, which blocks anything else
 * - afterAll re-enables only labels a test disabled, boots out every label, deletes the folder
 */
import { mkdtemp, realpath, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { controlAgent } from '../control'
import type { DomainService } from '../launchctl/domainParser'
import { parsePrintService } from '../launchctl/printParser'
import { execFileAsync, Launchctl, LaunchctlError } from '../launchctl/runner'
import { serializePlist, type PlistDict } from '../plist'
import { readDomains } from '../status'
import { guardedExec, TEST_PREFIX } from './guard'

const enabled = process.env.AGENTDESK_INTEGRATION === '1' && process.platform === 'darwin'

describe.runIf(enabled)('launchctl integration', () => {
  let sandbox: string
  let launchctl: Launchctl
  const labels: string[] = []
  const disabledLabels = new Set<string>()

  const label = (name: string): string => {
    const l = `${TEST_PREFIX}int.${name}`
    labels.push(l)
    return l
  }

  const writeAgent = async (l: string, extra: PlistDict): Promise<string> => {
    const file = join(sandbox, `${l}.plist`)
    await writeFile(file, serializePlist({ Label: l, ...extra }))
    return file
  }

  const act = (
    file: string,
    action: Parameters<typeof controlAgent>[1]
  ): ReturnType<typeof controlAgent> =>
    controlAgent(file, action, { launchctl, writableDirs: [{ dir: sandbox, scope: 'user' }] })

  const status = async (
    l: string
  ): Promise<{ service: ReturnType<Map<string, DomainService>['get']>; disabled: boolean }> => {
    const domains = await readDomains(launchctl, false)
    return {
      service: domains.gui.services.get(l),
      disabled: domains.gui.overrides?.get(l) === true
    }
  }

  const waitFor = async (check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> => {
    const deadline = Date.now() + timeoutMs
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error('timed out waiting for launchd')
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  beforeAll(async () => {
    sandbox = await realpath(await mkdtemp(join(tmpdir(), 'agentdesk-int-')))
    launchctl = new Launchctl({ uid: process.getuid!(), exec: guardedExec(execFileAsync, sandbox) })
  })

  afterAll(async () => {
    for (const l of disabledLabels) {
      await launchctl.run(launchctl.commands.enable(l)).catch(() => {})
    }
    for (const l of labels) {
      await launchctl.run(launchctl.commands.bootout(l)).catch(() => {})
    }
    for (const l of labels) {
      await expect(launchctl.run(launchctl.commands.printService(l))).rejects.toBeInstanceOf(
        LaunchctlError
      )
    }
    await rm(sandbox, { recursive: true, force: true })
  })

  it('the guard blocks real agents even in integration runs', async () => {
    await expect(
      launchctl.run(['bootout', `gui/${process.getuid!()}/com.apple.Finder`])
    ).rejects.toThrow(/Integration guard blocked/)
  })

  it('full lifecycle: load, start, restart, reload, unload', { timeout: 60_000 }, async () => {
    const l = label('lifecycle')
    const file = await writeAgent(l, { ProgramArguments: ['/bin/sleep', '600'] })

    expect(await act(file, 'load')).toEqual({ ok: true })
    expect((await status(l)).service).toBeDefined()
    expect(await act(file, 'load')).toMatchObject({
      ok: false,
      error: { summary: 'Already loaded' }
    })

    expect(await act(file, 'start')).toEqual({ ok: true })
    await waitFor(async () => (await status(l)).service?.pid !== undefined)
    const firstPid = (await status(l)).service!.pid

    // Real service print parses
    const printed = parsePrintService(await launchctl.run(launchctl.commands.printService(l)))
    expect(printed).toMatchObject({ label: l, running: true, pid: firstPid, program: '/bin/sleep' })
    expect(printed.arguments).toEqual(['/bin/sleep', '600'])

    expect(await act(file, 'restart')).toEqual({ ok: true })
    await waitFor(async () => {
      const pid = (await status(l)).service?.pid
      return pid !== undefined && pid !== firstPid
    })

    expect(await act(file, 'reload')).toEqual({ ok: true })
    expect((await status(l)).service).toBeDefined()

    expect(await act(file, 'unload')).toEqual({ ok: true })
    expect((await status(l)).service).toBeUndefined()
    expect(await act(file, 'unload')).toMatchObject({
      ok: false,
      error: { summary: 'Not loaded', exitCode: 3 }
    })
    expect(await act(file, 'start')).toMatchObject({ ok: false, error: { summary: 'Not loaded' } })
  })

  it('exit codes and signals show up in domain status', { timeout: 30_000 }, async () => {
    const ok = label('exit0')
    const bad = label('exit1')
    const okFile = await writeAgent(ok, { Program: '/usr/bin/true', RunAtLoad: true })
    const badFile = await writeAgent(bad, { Program: '/usr/bin/false', RunAtLoad: true })
    await act(okFile, 'load')
    await act(badFile, 'load')
    await waitFor(async () => (await status(ok)).service?.lastExitStatus === 0)
    await waitFor(async () => (await status(bad)).service?.lastExitStatus === 1)
  })

  it(
    'disable blocks loading with a clear reason; enable restores it',
    { timeout: 30_000 },
    async () => {
      const l = label('disabled')
      const file = await writeAgent(l, { Program: '/usr/bin/true' })
      disabledLabels.add(l)
      expect(await act(file, 'disable')).toEqual({ ok: true })
      expect((await status(l)).disabled).toBe(true)
      expect(await act(file, 'load')).toMatchObject({
        ok: false,
        error: { summary: 'Agent is disabled' }
      })
      expect(await act(file, 'enable')).toEqual({ ok: true })
      expect(await act(file, 'load')).toEqual({ ok: true })
    }
  )

  it('a missing program still loads, then reports EX_CONFIG', { timeout: 30_000 }, async () => {
    const l = label('badpath')
    const file = await writeAgent(l, { Program: '/nonexistent/agentdesk', RunAtLoad: true })
    expect(await act(file, 'load')).toEqual({ ok: true })
    await waitFor(async () => (await status(l)).service?.lastExitStatus === 78)
    const printed = parsePrintService(await launchctl.run(launchctl.commands.printService(l)))
    expect(printed.lastExitCode).toBe(78)
  })
})
