import { useCallback, useEffect, useState } from 'react'
import type { AgentSummary } from '../../../shared/agent-types'

/** Status (pid, running) changes without any file change: poll it while visible. */
const STATUS_POLL_MS = 5000

export interface AgentsState {
  agents: AgentSummary[]
  loading: boolean
  error: string | null
  statusError: string | null
  /** Bumped on every successful load, so dependants (detail panel) can re-read. */
  revision: number
  reload: () => void
}

export function useAgents(includeSystem: boolean): AgentsState {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  const fetchAgents = useCallback(() => {
    window.agentDesk.agents.list({ includeSystem }).then(
      (result) => {
        setAgents(result.agents)
        setStatusError(result.statusError ?? null)
        setError(null)
        setLoading(false)
        setRevision((r) => r + 1)
      },
      (e: Error) => {
        setError(e.message)
        setLoading(false)
      }
    )
  }, [includeSystem])

  useEffect(fetchAgents, [fetchAgents])

  // Files changed outside the app: refresh quietly (no loading flash)
  useEffect(() => window.agentDesk.agents.onChanged(fetchAgents), [fetchAgents])

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchAgents()
    }, STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [fetchAgents])

  const reload = useCallback(() => {
    setLoading(true)
    fetchAgents()
  }, [fetchAgents])

  return { agents, loading, error, statusError, revision, reload }
}
