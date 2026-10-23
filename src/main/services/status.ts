import type { AgentRuntime, AgentSummary } from '../../shared/agent-types'
import { parseDisabledBlock, parseDomainPrint, type DomainStatus } from './launchctl/domainParser'
import type { Launchctl } from './launchctl/runner'

export interface Domains {
  gui: DomainStatus
  system?: DomainStatus
}

/** One `launchctl print` per domain (plus print-disabled only if the block is missing). */
export async function readDomains(launchctl: Launchctl, includeSystem: boolean): Promise<Domains> {
  const gui = parseDomainPrint(await launchctl.run(launchctl.commands.printDomain()))
  if (!gui.overrides) {
    gui.overrides = parseDisabledBlock(await launchctl.run(launchctl.commands.printDisabled()))
  }
  const system = includeSystem
    ? parseDomainPrint(await launchctl.run(launchctl.commands.printSystemDomain()))
    : undefined
  return { gui, system }
}

export function runtimeFor(
  agent: AgentSummary,
  domain: DomainStatus | undefined
): AgentRuntime | undefined {
  if (!agent.label || !domain) return undefined
  const service = domain.services.get(agent.label)
  const override = domain.overrides?.get(agent.label)

  let enabled = true
  let enabledSource: AgentRuntime['enabledSource'] = 'default'
  if (override !== undefined) {
    enabled = !override
    enabledSource = 'override'
  } else if (agent.disabledKey !== undefined) {
    enabled = !agent.disabledKey
    enabledSource = 'plist'
  }

  if (!service) return { loaded: false, running: false, enabled, enabledSource }
  return {
    loaded: true,
    running: service.pid !== undefined,
    pid: service.pid,
    lastExitStatus: service.lastExitStatus,
    statusText: service.statusText,
    enabled,
    enabledSource
  }
}

/** Pure: daemons live in the system domain, user and global agents in gui/<uid>. */
export function attachRuntime(agents: AgentSummary[], domains: Domains): AgentSummary[] {
  return agents.map((agent) => {
    const domain = agent.scope === 'global-daemon' ? domains.system : domains.gui
    const runtime = runtimeFor(agent, domain)
    return runtime ? { ...agent, runtime } : agent
  })
}
