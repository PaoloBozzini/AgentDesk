import type { ActionError, ActionResult, AgentAction } from '../../shared/control-types'
import { isValidLabel } from '../../shared/label'
import { readAgent, type AgentDir } from './agents'
import { parseDomainPrint } from './launchctl/domainParser'
import { LaunchctlError, type Launchctl } from './launchctl/runner'

export interface ControlDeps {
  launchctl: Launchctl
  /** Only user folders: system agents are read-only. */
  writableDirs: AgentDir[]
  sleep?: (ms: number) => Promise<void>
  /** How long reload waits for launchd to forget the service after bootout. */
  unloadTimeoutMs?: number
}

/** `kickstart -k` waits out launchd's respawn throttle (ThrottleInterval, 10 s by default). */
const RESTART_TIMEOUT_MS = 30_000

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

class ControlFailure extends Error {
  constructor(readonly detail: ActionError) {
    super(detail.summary)
  }
}

function fail(summary: string, hint?: string, cause?: LaunchctlError): never {
  throw new ControlFailure({
    summary,
    hint,
    command: cause ? ['launchctl', ...cause.args] : [],
    exitCode: cause?.code ?? null,
    stdout: cause?.stdout ?? '',
    stderr: cause?.stderr ?? ''
  })
}

/** Turns a raw launchctl failure into an explanation, given what we know about the agent. */
export function explain(
  action: AgentAction,
  err: LaunchctlError,
  state: { loaded: boolean; disabled: boolean }
): { summary: string; hint?: string } {
  if (err.timedOut) return { summary: 'launchctl timed out' }
  const bootstrapping = action === 'load' || action === 'reload'
  if (bootstrapping && err.code === 5) {
    if (state.loaded) return { summary: 'Already loaded', hint: 'Use Reload to apply changes.' }
    if (state.disabled) return { summary: 'Agent is disabled', hint: 'Enable it, then load it.' }
    return {
      summary: 'launchd refused to load the agent',
      hint: 'Check the plist (Program path, keys) and the system log.'
    }
  }
  if (err.code === 3 || err.isServiceNotFound) {
    return { summary: 'Not loaded', hint: action === 'unload' ? undefined : 'Load it first.' }
  }
  return { summary: err.message }
}

export async function controlAgent(
  path: unknown,
  action: AgentAction,
  deps: ControlDeps
): Promise<ActionResult> {
  try {
    await run(path, action, deps)
    return { ok: true }
  } catch (e) {
    if (e instanceof ControlFailure) return { ok: false, error: e.detail }
    return {
      ok: false,
      error: { summary: (e as Error).message, command: [], exitCode: null, stdout: '', stderr: '' }
    }
  }
}

async function run(path: unknown, action: AgentAction, deps: ControlDeps): Promise<void> {
  const { launchctl } = deps
  const c = launchctl.commands
  // Label comes from the file on disk, never from the renderer
  const detail = await readAgent(path, deps.writableDirs).catch((e: Error) =>
    fail('This agent can’t be controlled', e.message)
  )
  const label = detail.summary.label
  if (!isValidLabel(label)) fail('The plist has no valid Label', 'Add a Label key first.')

  const state = async (): Promise<{ loaded: boolean; disabled: boolean }> => {
    const domain = parseDomainPrint(await launchctl.run(c.printDomain()))
    return { loaded: domain.services.has(label), disabled: domain.overrides?.get(label) === true }
  }

  const exec = async (args: string[], timeoutMs?: number): Promise<void> => {
    try {
      await launchctl.run(args, { timeoutMs })
    } catch (e) {
      if (!(e instanceof LaunchctlError)) throw e
      const s = await state().catch(() => ({ loaded: false, disabled: false }))
      const { summary, hint } = explain(action, e, s)
      fail(summary, hint, e)
    }
  }

  switch (action) {
    case 'load': {
      const s = await state()
      if (s.loaded) fail('Already loaded', 'Use Reload to apply changes.')
      if (s.disabled) fail('Agent is disabled', 'Enable it, then load it.')
      return exec(c.bootstrap(detail.summary.path))
    }
    case 'unload':
      return exec(c.bootout(label))
    case 'start':
      return exec(c.kickstart(label))
    case 'restart':
      return exec(c.kickstart(label, true), RESTART_TIMEOUT_MS)
    case 'enable':
      return exec(c.enable(label))
    case 'disable':
      return exec(c.disable(label))
    case 'reload': {
      const s = await state()
      if (s.disabled) fail('Agent is disabled', 'Enable it, then load it.')
      if (s.loaded) {
        await exec(c.bootout(label))
        await waitUntilUnloaded(label, deps)
      }
      return exec(c.bootstrap(detail.summary.path))
    }
  }
}

/** bootout can return before launchd has forgotten the service; poll until print says it's gone. */
async function waitUntilUnloaded(label: string, deps: ControlDeps): Promise<void> {
  const sleep = deps.sleep ?? defaultSleep
  const deadline = Date.now() + (deps.unloadTimeoutMs ?? 10_000)
  for (;;) {
    try {
      await deps.launchctl.run(deps.launchctl.commands.printService(label))
    } catch (e) {
      if (e instanceof LaunchctlError && e.isServiceNotFound) return
      throw e
    }
    if (Date.now() > deadline) {
      fail('The agent is still shutting down', 'Try Reload again in a few seconds.')
    }
    await sleep(200)
  }
}
