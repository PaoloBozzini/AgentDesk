import { useState } from 'react'
import type { AgentSummary } from '../../../shared/agent-types'
import type { ActionError, AgentAction } from '../../../shared/control-types'
import { availableActions } from '../lib/actions'
import { ErrorPanel } from './ErrorPanel'

const LABELS: Record<AgentAction, string> = {
  load: 'Load',
  unload: 'Unload',
  start: 'Start',
  restart: 'Restart',
  reload: 'Reload',
  enable: 'Enable',
  disable: 'Disable'
}

export function AgentActions({
  agent,
  onDone
}: {
  agent: AgentSummary
  onDone: () => void
}): React.JSX.Element | null {
  const [busy, setBusy] = useState<AgentAction | null>(null)
  const [error, setError] = useState<{ action: AgentAction; error: ActionError } | null>(null)
  const actions = availableActions(agent)
  if (actions.length === 0) return null

  const run = async (action: AgentAction): Promise<void> => {
    setBusy(action)
    setError(null)
    try {
      const result = await window.agentDesk.agents.control(agent.path, action)
      if (!result.ok) setError({ action, error: result.error })
    } catch (e) {
      setError({
        action,
        error: {
          summary: (e as Error).message,
          command: [],
          exitCode: null,
          stdout: '',
          stderr: ''
        }
      })
    } finally {
      setBusy(null)
      onDone()
    }
  }

  return (
    <div className="actions">
      <div className="action-buttons">
        {actions.map((action) => (
          <button
            key={action}
            className={action === 'load' ? 'button primary' : 'button'}
            disabled={busy !== null}
            onClick={() => void run(action)}
          >
            {busy === action ? `${LABELS[action]}…` : LABELS[action]}
          </button>
        ))}
      </div>
      {busy === 'restart' && (
        <p className="muted action-note">launchd waits for its restart throttle (about 10 s)…</p>
      )}
      {error && (
        <ErrorPanel
          title={LABELS[error.action]}
          error={error.error}
          onDismiss={() => setError(null)}
        />
      )}
    </div>
  )
}
