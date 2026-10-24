import { useEffect, useRef, useState } from 'react'
import type { AgentSummary } from '../../../shared/agent-types'
import type { ActionError } from '../../../shared/control-types'
import { ErrorPanel } from './ErrorPanel'

export function DeleteAgentDialog({
  agent,
  onDeleted,
  onClose
}: {
  agent: AgentSummary
  onDeleted: () => void
  onClose: () => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; unload?: ActionError } | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const loaded = agent.runtime?.loaded === true

  useEffect(() => {
    // Safe default: Enter/Space on open cancels
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, onClose])

  const remove = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.agentDesk.agents.delete(agent.path)
      if (result.ok) onDeleted()
      else setError({ message: result.error, unload: result.unloadError })
    } catch (e) {
      setError({ message: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="modal modal-narrow"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-desc"
      >
        <header className="modal-header">
          <h2 id="delete-title">Delete agent?</h2>
        </header>
        <div className="modal-body" id="delete-desc">
          <dl className="confirm-facts">
            <dt>Label</dt>
            <dd className="mono">{agent.label ?? '(none)'}</dd>
            <dt>File</dt>
            <dd className="mono">{agent.path}</dd>
          </dl>
          <ul className="confirm-steps">
            {loaded && <li>It is loaded: launchd will unload it first (bootout).</li>}
            <li>A backup copy is saved in Application Support/Agent Desk/backups.</li>
            <li>The file is moved to the Trash, so you can put it back from there.</li>
          </ul>
          {error &&
            (error.unload ? (
              <ErrorPanel title="Unload" error={error.unload} />
            ) : (
              <p className="notice error-notice" role="alert">
                {error.message}
              </p>
            ))}
        </div>
        <footer className="modal-footer">
          <span className="spacer" />
          <button className="button" ref={cancelRef} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button danger" onClick={() => void remove()} disabled={busy}>
            {busy ? 'Deleting…' : 'Move to Trash'}
          </button>
        </footer>
      </div>
    </div>
  )
}
