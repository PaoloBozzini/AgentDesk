import type { AgentSummary } from '../../../shared/agent-types'

export interface AgentFilter {
  query: string
  // Status filters (loaded / running / failed / not loaded) join here in #17
}

export const EMPTY_FILTER: AgentFilter = { query: '' }

/** Case-insensitive substring match on label (file name when the label is missing). */
export function filterAgents(agents: AgentSummary[], filter: AgentFilter): AgentSummary[] {
  const q = filter.query.trim().toLowerCase()
  if (!q) return agents
  return agents.filter((a) => (a.label ?? a.fileName).toLowerCase().includes(q))
}
