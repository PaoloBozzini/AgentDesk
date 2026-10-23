import { useState } from 'react'
import type { ActionError } from '../../../shared/control-types'
import { errorReport, formatCommand } from '../lib/command'

export function ErrorPanel({
  title,
  error,
  onDismiss
}: {
  title: string
  error: ActionError
  onDismiss?: () => void
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const hasDetails = error.command.length > 0 || error.stderr.trim() || error.stdout.trim()

  const copy = async (): Promise<void> => {
    await window.agentDesk.app.copyText(errorReport(title, error))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="error-panel" role="alert">
      <div className="error-panel-head">
        <div>
          <strong>
            {title} failed: {error.summary}
          </strong>
          {error.hint && <p className="error-hint">{error.hint}</p>}
        </div>
        <div className="error-panel-buttons">
          <button className="link-button" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          {onDismiss && (
            <button className="icon-button" onClick={onDismiss} aria-label="Dismiss error">
              ✕
            </button>
          )}
        </div>
      </div>
      {hasDetails && (
        <details className="error-details">
          <summary>
            Details{error.exitCode !== null ? ` (exit code ${error.exitCode})` : ''}
          </summary>
          {error.command.length > 0 && <pre className="mono">$ {formatCommand(error.command)}</pre>}
          {error.stderr.trim() && (
            <>
              <h4>stderr</h4>
              <pre className="mono">{error.stderr.trimEnd()}</pre>
            </>
          )}
          {error.stdout.trim() && (
            <>
              <h4>stdout</h4>
              <pre className="mono">{error.stdout.trimEnd()}</pre>
            </>
          )}
        </details>
      )}
    </div>
  )
}
