import type { AgentSummary } from '../../../shared/agent-types'

export function programLine(agent: AgentSummary): string {
  if (agent.programArguments?.length) return agent.programArguments.join(' ')
  return agent.program ?? ''
}
