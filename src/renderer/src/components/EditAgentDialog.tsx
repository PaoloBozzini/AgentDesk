import { useEffect, useState } from 'react'
import type { AgentDetail } from '../../../shared/agent-types'
import { plistToForm, type FormErrors } from '../../../shared/agent-form'
import type { ActionError } from '../../../shared/control-types'
import type { PlistInput } from '../../../shared/edit-types'
import { docInput, type EditorDoc } from '../lib/editorDoc'
import { AgentEditor } from './AgentEditor'
import { DiffView } from './DiffView'
import { ErrorPanel } from './ErrorPanel'

type Step =
  | { kind: 'edit' }
  | { kind: 'review'; input: PlistInput; after: string }
  | { kind: 'saved'; backupPath: string }

type Problem = { message: string; details?: string } | null

function initialDoc(detail: AgentDetail): EditorDoc {
  const form = plistToForm(detail.data)
  // origin: switching to XML without edits shows the file's own text
  return { mode: 'form', form, xml: detail.xml, origin: { xml: detail.xml, form } }
}

export function EditAgentDialog({
  detail,
  loaded,
  onSaved,
  onClose
}: {
  detail: AgentDetail
  /** launchd has the agent loaded: offer a reload after saving. */
  loaded: boolean
  onSaved: () => void
  onClose: () => void
}): React.JSX.Element {
  const { summary } = detail
  const [step, setStep] = useState<Step>({ kind: 'edit' })
  const [doc, setDoc] = useState<EditorDoc>(() => initialDoc(detail))
  const [errors, setErrors] = useState<FormErrors>({})
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem>(null)
  const [reload, setReload] = useState<'idle' | 'running' | 'done' | ActionError>('idle')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, onClose])

  const review = async (): Promise<void> => {
    setProblem(null)
    const prepared = docInput(doc)
    if (!prepared.ok) {
      setErrors(prepared.fieldErrors ?? {})
      setProblem({ message: prepared.error })
      return
    }
    setErrors({})
    let after: string
    if ('xml' in prepared.input) {
      after = prepared.input.xml
    } else {
      setBusy(true)
      const converted = await window.agentDesk.plist
        .convert(prepared.input)
        .finally(() => setBusy(false))
      if (!converted.ok) {
        setProblem({ message: converted.error })
        return
      }
      after = converted.xml
    }
    setStep({ kind: 'review', input: prepared.input, after })
  }

  const save = async (input: PlistInput): Promise<void> => {
    setBusy(true)
    setProblem(null)
    try {
      const result = await window.agentDesk.agents.save(summary.path, input, {
        baseHash: detail.hash
      })
      if (result.ok) {
        setStep({ kind: 'saved', backupPath: result.backupPath })
        onSaved()
        return
      }
      const fieldText =
        doc.mode === 'xml' && result.fieldErrors
          ? Object.entries(result.fieldErrors)
              .map(([field, msg]) => `${field}: ${msg}`)
              .join('\n')
          : undefined
      setProblem({ message: result.error, details: result.lint ?? fieldText })
      if (result.fieldErrors) {
        setErrors(result.fieldErrors)
        setStep({ kind: 'edit' })
      }
    } catch (e) {
      setProblem({ message: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const runReload = async (): Promise<void> => {
    setReload('running')
    try {
      const result = await window.agentDesk.agents.control(summary.path, 'reload')
      setReload(result.ok ? 'done' : result.error)
    } catch (e) {
      setReload({
        summary: (e as Error).message,
        command: [],
        exitCode: null,
        stdout: '',
        stderr: ''
      })
    } finally {
      onSaved()
    }
  }

  const unchanged = step.kind === 'review' && step.after === detail.xml

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
      >
        <header className="modal-header">
          <h2 id="edit-title">
            {step.kind === 'review' ? 'Review changes' : 'Edit'}{' '}
            <span className="mono">{summary.label ?? summary.fileName}</span>
          </h2>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close">
            ✕
          </button>
        </header>

        {step.kind === 'edit' && (
          <div className="modal-body">
            <AgentEditor
              doc={doc}
              errors={errors}
              onChange={setDoc}
              onErrors={setErrors}
              disabled={busy}
              labelReadOnly
            />
          </div>
        )}

        {step.kind === 'review' && (
          <div className="modal-body">
            {summary.format === 'binary' && (
              <p className="notice">
                This file is a binary plist. Saving writes it back as XML (launchd reads both).
              </p>
            )}
            {unchanged ? (
              <p className="state">No changes.</p>
            ) : (
              <>
                <div className="diff-heads">
                  <span>On disk{summary.format === 'binary' ? ' (as XML)' : ''}</span>
                  <span>After save</span>
                </div>
                <DiffView before={detail.xml} after={step.after} />
                <p className="muted field-hint">
                  The current file is backed up before it is replaced.
                </p>
              </>
            )}
          </div>
        )}

        {step.kind === 'saved' && (
          <div className="modal-body">
            <p>Saved.</p>
            <p className="muted field-hint">
              Backup: <span className="mono">{step.backupPath}</span>
            </p>
            {loaded && reload === 'idle' && (
              <p className="notice">
                The agent is loaded, so launchd still runs the old version. Reload it to apply the
                changes.
              </p>
            )}
            {reload === 'done' && <p className="notice">Reloaded.</p>}
            {typeof reload === 'object' && <ErrorPanel title="Reload" error={reload} />}
          </div>
        )}

        {problem && (
          <div className="modal-problem" role="alert">
            <strong>{problem.message}</strong>
            {problem.details && <pre className="mono">{problem.details}</pre>}
          </div>
        )}

        <footer className="modal-footer">
          {step.kind === 'review' && (
            <button
              className="link-button"
              onClick={() => setStep({ kind: 'edit' })}
              disabled={busy}
            >
              ← Back to editing
            </button>
          )}
          <span className="spacer" />
          {step.kind === 'saved' ? (
            <>
              {loaded && reload !== 'done' && (
                <button
                  className="button primary"
                  onClick={() => void runReload()}
                  disabled={reload === 'running'}
                >
                  {reload === 'running' ? 'Reloading…' : 'Reload now'}
                </button>
              )}
              <button className="button" onClick={onClose} disabled={reload === 'running'}>
                Close
              </button>
            </>
          ) : (
            <>
              <button className="button" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              {step.kind === 'edit' ? (
                <button className="button primary" onClick={() => void review()} disabled={busy}>
                  Review changes…
                </button>
              ) : (
                <button
                  className="button primary"
                  onClick={() => void save(step.input)}
                  disabled={busy || unchanged}
                >
                  {busy ? 'Saving…' : 'Save'}
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
