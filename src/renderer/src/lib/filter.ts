import type { AgentSummary } from '../../../shared/agent-types'
import { isFailed } from './format'

export const STATUS_FILTERS = ['all', 'loaded', 'running', 'failed', 'not-loaded'] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  loaded: 'Loaded',
  running: 'Running',
  failed: 'Failed',
  'not-loaded': 'Not loaded'
}

export interface AgentFilter {
  query: string
  status: StatusFilter
}

export const EMPTY_FILTER: AgentFilter = { query: '', status: 'all' }

export function matchesStatus(agent: AgentSummary, status: StatusFilter): boolean {
  const rt = agent.runtime
  switch (status) {
    case 'all':
      return true
    case 'loaded':
      return rt?.loaded === true
    case 'running':
      return rt?.running === true
    case 'failed':
      return isFailed(rt)
    case 'not-loaded':
      // Unknown status (no label / launchctl error) is not "not loaded"
      return rt?.loaded === false
  }
}

function matchesQuery(agent: AgentSummary, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || (agent.label ?? agent.fileName).toLowerCase().includes(q)
}

/** Case-insensitive label search (file name when there's no label) combined with a status filter. */
export function filterAgents(agents: AgentSummary[], filter: AgentFilter): AgentSummary[] {
  if (!filter.query.trim() && filter.status === 'all') return agents
  return agents.filter((a) => matchesQuery(a, filter.query) && matchesStatus(a, filter.status))
}

/** Per-status counts for the current search, so the chips show what clicking them would give. */
export function statusCounts(agents: AgentSummary[], query: string): Record<StatusFilter, number> {
  const searched = agents.filter((a) => matchesQuery(a, query))
  return Object.fromEntries(
    STATUS_FILTERS.map((s) => [s, searched.filter((a) => matchesStatus(a, s)).length])
  ) as Record<StatusFilter, number>
}
