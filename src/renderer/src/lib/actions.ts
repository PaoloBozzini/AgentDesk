import type { AgentSummary } from '../../../shared/agent-types'
import type { AgentAction } from '../../../shared/control-types'

/** Which actions make sense for the agent's current state. */
export function availableActions(agent: AgentSummary): AgentAction[] {
  const rt = agent.runtime
  if (agent.readOnly || !agent.label || !rt) return []
  const actions: AgentAction[] = rt.loaded
    ? ['unload', rt.running ? 'restart' : 'start', 'reload']
    : ['load']
  actions.push(rt.enabled ? 'disable' : 'enable')
  return actions
}
