import { useState } from 'react'
import type { AgentForm, FormErrors } from '../../../shared/agent-form'
import { switchToForm, switchToXml, type EditorDoc, type EditorMode } from '../lib/editorDoc'
import { AgentFormFields } from './AgentFormFields'
import { XmlEditor } from './XmlEditor'

/** Form / XML editor for one agent plist; switching converts and keeps changes. */
export function AgentEditor({
  doc,
  errors,
  onChange,
  onErrors,
  onFormChange,
  disabled = false,
  labelReadOnly = false
}: {
  doc: EditorDoc
  errors: FormErrors
  onChange: (doc: EditorDoc) => void
  onErrors: (errors: FormErrors) => void
  /** Optional hook for form edits (e.g. log paths following the label). */
  onFormChange?: (prev: AgentForm, next: AgentForm) => AgentForm
  disabled?: boolean
  labelReadOnly?: boolean
}): React.JSX.Element {
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)

  const switchTo = async (mode: EditorMode): Promise<void> => {
    if (mode === doc.mode || switching) return
    setSwitching(true)
    setSwitchError(null)
    try {
      const convert = window.agentDesk.plist.convert
      const result =
        mode === 'xml' ? await switchToXml(doc, convert) : await switchToForm(doc, convert)
      if (result.ok) {
        onErrors({})
        onChange(result.doc)
      } else {
        setSwitchError(result.error)
        if (result.fieldErrors) onErrors(result.fieldErrors)
      }
    } catch (e) {
      setSwitchError((e as Error).message)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="agent-editor">
      <div className="editor-modes">
        <div className="segmented" role="tablist" aria-label="Editor mode">
          {(['form', 'xml'] as const).map((mode) => (
            <button
              key={mode}
              role="tab"
              aria-selected={doc.mode === mode}
              className={doc.mode === mode ? 'chip active' : 'chip'}
              disabled={disabled || switching}
              onClick={() => void switchTo(mode)}
            >
              {mode === 'form' ? 'Form' : 'XML'}
            </button>
          ))}
        </div>
        {switching && <span className="muted">Converting…</span>}
      </div>
      {switchError && (
        <p className="notice error-notice" role="alert">
          {switchError}
        </p>
      )}
      {doc.mode === 'form' ? (
        <AgentFormFields
          form={doc.form}
          errors={errors}
          labelReadOnly={labelReadOnly}
          onChange={(next) =>
            onChange({ ...doc, form: onFormChange ? onFormChange(doc.form, next) : next })
          }
        />
      ) : (
        <XmlEditor
          value={doc.xml}
          readOnly={disabled}
          onChange={(xml) => {
            setSwitchError(null)
            onChange({ ...doc, xml })
          }}
        />
      )}
    </div>
  )
}
