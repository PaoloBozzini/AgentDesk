import { useCallback, useEffect, useState } from 'react'
import type { AgentSummary } from '../../../shared/agent-types'

export interface AgentsState {
  agents: AgentSummary[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useAgents(): AgentsState {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAgents = useCallback(() => {
    window.agentDesk.agents.list().then(
      (list) => {
        setAgents(list)
        setError(null)
        setLoading(false)
      },
      (e: Error) => {
        setError(e.message)
        setLoading(false)
      }
    )
  }, [])

  useEffect(fetchAgents, [fetchAgents])

  const reload = useCallback(() => {
    setLoading(true)
    fetchAgents()
  }, [fetchAgents])

  return { agents, loading, error, reload }
}
