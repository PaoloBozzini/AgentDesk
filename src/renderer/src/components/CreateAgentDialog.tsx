import { useEffect, useRef, useState } from 'react'
import { suggestLabel, withDefaultLogPaths } from '../../../shared/agent-defaults'
import {
  emptyAgentForm,
  formToPlist,
  type AgentForm,
  type FormErrors
} from '../../../shared/agent-form'
import { AGENT_TEMPLATES, type AgentTemplate } from '../../../shared/agent-templates'
import type { ActionError } from '../../../shared/control-types'
import type { AppInfo } from '../../../shared/ipc-contract'
import { followLabel, tidyForm } from '../lib/formEdit'
import { AgentFormFields } from './AgentFormFields'
import { ErrorPanel } from './ErrorPanel'

type Step =
  | { kind: 'pick' }
  | { kind: 'edit'; template?: AgentTemplate }
  | { kind: 'loadFailed'; path: string; error: ActionError }

type Problem = { message: string; lint?: string } | null

export function CreateAgentDialog({
  info,
  onCreated,
  onClose
}: {
  info: AppInfo
  /** The file was written (selected in the list by the caller). */
  onCreated: (path: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [step, setStep] = useState<Step>({ kind: 'pick' })
  const [form, setForm] = useState<AgentForm>(emptyAgentForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [load, setLoad] = useState(true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    dialogRef.current
      ?.querySelector<HTMLElement>('.modal-body input, .modal-body button, .modal-footer button')
      ?.focus()
  }, [step.kind])

  const start = (template?: AgentTemplate): void => {
    const base = template ? template.build({ home: info.home }) : emptyAgentForm()
    const label = suggestLabel(info.userName, 'my-agent')
    setForm(withDefaultLogPaths({ ...base, label }, info.home))
    setErrors({})
    setProblem(null)
    setStep({ kind: 'edit', template })
  }

  const change = (next: AgentForm): void => setForm((prev) => followLabel(prev, next, info.home))

  const create = async (): Promise<void> => {
    const tidy = tidyForm(form)
    setForm(tidy)
    const result = formToPlist(tidy)
    if (!result.ok) {
      setErrors(result.errors)
      setProblem({ message: 'Fix the highlighted fields' })
      return
    }
    setErrors({})
    setProblem(null)
    setBusy(true)
    try {
      const created = await window.agentDesk.agents.create({ data: result.data }, { load })
      if (!created.ok) {
        setErrors(created.fieldErrors ?? {})
        setProblem({ message: created.error, lint: created.lint })
        return
      }
      onCreated(created.path)
      if (created.loadError)
        setStep({ kind: 'loadFailed', path: created.path, error: created.loadError })
      else onClose()
    } catch (e) {
      setProblem({ message: (e as Error).message })
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
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-agent-title"
        ref={dialogRef}
      >
        <header className="modal-header">
          <h2 id="create-agent-title">
            {step.kind === 'edit' && step.template
              ? `New agent: ${step.template.name}`
              : 'New agent'}
          </h2>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close">
            ✕
          </button>
        </header>

        {step.kind === 'pick' && (
          <div className="modal-body">
            <p className="muted">Start from a template, or from a blank form.</p>
            <div className="template-grid">
              {AGENT_TEMPLATES.map((t) => (
                <button key={t.id} className="template-card" onClick={() => start(t)}>
                  <strong>{t.name}</strong>
                  <span className="muted">{t.description}</span>
                </button>
              ))}
              <button className="template-card" onClick={() => start()}>
                <strong>Blank</strong>
                <span className="muted">Only the label and log paths are filled in.</span>
              </button>
            </div>
          </div>
        )}

        {step.kind === 'edit' && (
          <>
            <div className="modal-body">
              <AgentFormFields form={form} errors={errors} onChange={change} />
            </div>
            {problem && (
              <div className="modal-problem" role="alert">
                <strong>{problem.message}</strong>
                {problem.lint && <pre className="mono">{problem.lint}</pre>}
              </div>
            )}
            <footer className="modal-footer">
              <button
                className="link-button"
                onClick={() => setStep({ kind: 'pick' })}
                disabled={busy}
              >
                ← Templates
              </button>
              <span className="spacer" />
              <label className="toggle">
                <input type="checkbox" checked={load} onChange={(e) => setLoad(e.target.checked)} />
                Load now
              </label>
              <button className="button" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className="button primary" onClick={() => void create()} disabled={busy}>
                {busy ? 'Creating…' : 'Create'}
              </button>
            </footer>
          </>
        )}

        {step.kind === 'loadFailed' && (
          <>
            <div className="modal-body">
              <p>
                Created <span className="mono">{step.path}</span>, but loading it failed. You can
                fix it and load it from the detail panel.
              </p>
              <ErrorPanel title="Load" error={step.error} />
            </div>
            <footer className="modal-footer">
              <span className="spacer" />
              <button className="button primary" onClick={onClose}>
                Close
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
