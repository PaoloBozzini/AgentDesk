import { useId, useState } from 'react'
import {
  CALENDAR_FIELDS,
  emptyCalendarEntry,
  type AgentForm,
  type CalendarField,
  type FormErrors,
  type KeepAliveForm,
  type ScriptShell,
  type TriState,
  SCRIPT_SHELLS,
  importScriptFile,
  isUntouchedOrigin,
  scriptFileOf,
  switchCommandMode
} from '../../../shared/agent-form'
import { errorsLogNextTo, intervalHint, linesToList, listToLines } from '../lib/formEdit'
import { CodeEditor } from './CodeEditor'

const CALENDAR_LABELS: Record<CalendarField, string> = {
  minute: 'Minute',
  hour: 'Hour',
  day: 'Day',
  weekday: 'Weekday',
  month: 'Month'
}

const KEEP_ALIVE_LABELS: Record<KeepAliveForm['mode'], string> = {
  unset: 'Not set',
  always: 'Always restart',
  never: 'Never (KeepAlive false)',
  conditional: 'When…'
}

function Field({
  label,
  error,
  hint,
  children
}: {
  label: string
  error?: string
  hint?: string
  children: (id: string) => React.ReactNode
}): React.JSX.Element {
  const id = useId()
  return (
    <div className={error ? 'field has-error' : 'field'}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="field-hint muted">{hint}</p>
      )}
    </div>
  )
}

function TriSelect({
  id,
  value,
  onChange
}: {
  id?: string
  value: TriState
  onChange: (v: TriState) => void
}): React.JSX.Element {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as TriState)}>
      <option value="unset">—</option>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  )
}

/** Errors for `prefix.<i>…`, joined; shown under list textareas. */
function listErrors(errors: FormErrors, prefix: string): string | undefined {
  const messages = Object.entries(errors)
    .filter(([path]) => path === prefix || path.startsWith(`${prefix}.`))
    .map(([path, msg]) => {
      const index = path.slice(prefix.length + 1).split('.')[0]
      return index ? `Line ${Number(index) + 1}: ${msg}` : msg
    })
  return messages.length ? messages.join(' · ') : undefined
}

/**
 * Controlled editor for the managed keys of an agent plist. Keys it doesn't
 * manage are kept by the form model and listed at the bottom.
 */
export function AgentFormFields({
  form,
  errors,
  onChange,
  labelReadOnly = false,
  moreOptionsOpen = true,
  agentPath
}: {
  form: AgentForm
  errors: FormErrors
  onChange: (form: AgentForm) => void
  labelReadOnly?: boolean
  /** Start with "More options" expanded (it also opens itself on errors inside). */
  moreOptionsOpen?: boolean
  /** Agent being edited: lets Script mode copy in the script file it runs. */
  agentPath?: string
}): React.JSX.Element {
  const [moreOpen, setMoreOpen] = useState(moreOptionsOpen)
  const [scriptChoice, setScriptChoice] = useState<{
    file: string
    busy: boolean
    error?: string
  } | null>(null)

  const chooseMode = (mode: AgentForm['commandMode']): void => {
    if (mode === form.commandMode) return
    const candidate = mode === 'script' && agentPath ? scriptFileOf(form) : undefined
    if (candidate) {
      setScriptChoice({ file: candidate.file, busy: false })
      return
    }
    setScriptChoice(null)
    onChange(switchCommandMode(form, mode))
  }

  const copyScriptFile = async (file: string): Promise<void> => {
    setScriptChoice({ file, busy: true })
    try {
      const result = await window.agentDesk.agents.readScriptFile(agentPath!, file)
      if (!result.ok) return setScriptChoice({ file, busy: false, error: result.error })
      setScriptChoice(null)
      onChange(importScriptFile(form, result.file, result.text, result.shell))
    } catch (e) {
      setScriptChoice({ file, busy: false, error: (e as Error).message })
    }
  }
  const set = <K extends keyof AgentForm>(key: K, value: AgentForm[K]): void =>
    onChange({ ...form, [key]: value })
  const setKeepAlive = (patch: Partial<KeepAliveForm>): void =>
    set('keepAlive', { ...form.keepAlive, ...patch })
  const otherKeys = Object.keys(form.extra).filter(
    (k) => !(form.unsupported as string[]).includes(k)
  )
  const otherKeepAlive = Object.keys(form.keepAlive.other)
  const oneLog = form.standardOutPath !== '' && form.standardOutPath === form.standardErrorPath
  const moreErrors = Object.keys(errors).some((k) =>
    /^(workingDirectory|environmentVariables|standardOutPath|standardErrorPath)/.test(k)
  )

  return (
    <div className="agent-form">
      {form.unsupported.length > 0 && (
        <p className="notice">
          Edit in XML: {form.unsupported.join(', ')}{' '}
          {form.unsupported.length === 1 ? 'has' : 'have'} a value this form can’t show. It is kept
          as-is unless you fill in the field here.
        </p>
      )}

      <fieldset>
        <legend>Agent</legend>
        <Field label="Label" error={errors.label} hint="Reverse-DNS, e.g. com.you.backup">
          {(id) => (
            <input
              id={id}
              className="mono"
              value={form.label}
              readOnly={labelReadOnly}
              spellCheck={false}
              onChange={(e) => set('label', e.target.value)}
            />
          )}
        </Field>
      </fieldset>

      <fieldset>
        <legend>Command</legend>
        <div className="segmented command-modes" role="tablist" aria-label="Command type">
          {(['script', 'program'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={form.commandMode === mode}
              className={form.commandMode === mode ? 'chip active' : 'chip'}
              onClick={() => chooseMode(mode)}
            >
              {mode === 'script' ? 'Script' : 'Program'}
            </button>
          ))}
        </div>
        {scriptChoice && (
          <div className="choice-panel" role="group" aria-label="Switch to Script">
            <p>
              This agent runs the script file <span className="mono">{scriptChoice.file}</span>. How
              should Script mode use it?
            </p>
            <div className="choice-buttons">
              <button
                type="button"
                className="button primary"
                disabled={scriptChoice.busy}
                onClick={() => void copyScriptFile(scriptChoice.file)}
              >
                {scriptChoice.busy ? 'Reading…' : 'Copy its contents into the agent'}
              </button>
              <button
                type="button"
                className="button"
                disabled={scriptChoice.busy}
                onClick={() => {
                  setScriptChoice(null)
                  onChange(switchCommandMode(form, 'script'))
                }}
              >
                Keep calling the file
              </button>
              <button
                type="button"
                className="link-button"
                disabled={scriptChoice.busy}
                onClick={() => setScriptChoice(null)}
              >
                Cancel
              </button>
            </div>
            <p className="field-hint muted">Copying only reads the file; it stays where it is.</p>
            {scriptChoice.error && (
              <p className="field-error" role="alert">
                {scriptChoice.error}
              </p>
            )}
          </div>
        )}
        {form.commandMode === 'script' ? (
          <div className={errors.script ? 'field has-error' : 'field'}>
            <div className="script-head">
              <span className="field-label">Script</span>
              <select
                aria-label="Shell"
                value={form.scriptShell}
                onChange={(e) => set('scriptShell', e.target.value as ScriptShell)}
              >
                {SCRIPT_SHELLS.map((sh) => (
                  <option key={sh} value={sh}>
                    {sh.replace('/bin/', '')}
                  </option>
                ))}
              </select>
            </div>
            <CodeEditor
              language="shell"
              className="script-editor"
              ariaLabel="Script"
              value={form.script}
              invalid={!!errors.script}
              onChange={(script) => set('script', script)}
            />
            {errors.script ? (
              <pre className="field-error mono" role="alert">
                {errors.script}
              </pre>
            ) : form.commandOrigin && isUntouchedOrigin(form) ? (
              <p className="notice">
                {form.commandOrigin.kind === 'file' ? (
                  <>
                    Copied from <span className="mono">{form.commandOrigin.file}</span>. Once you
                    save, the agent runs this script and no longer uses that file.
                  </>
                ) : (
                  <>
                    This is the command the agent ran before. Replace it with your own commands, or
                    switch back to Program to restore it exactly.
                  </>
                )}
              </p>
            ) : (
              <p className="field-hint muted">
                Runs without your shell profile: PATH is set under More options.
              </p>
            )}
          </div>
        ) : (
          <>
            <Field
              label="Program"
              error={errors.program}
              hint="Absolute path. Optional when the first argument is the executable."
            >
              {(id) => (
                <input
                  id={id}
                  className="mono"
                  value={form.program}
                  spellCheck={false}
                  placeholder="/usr/local/bin/my-script"
                  onChange={(e) => set('program', e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Arguments (one per line)"
              error={listErrors(errors, 'programArguments')}
              hint="ProgramArguments. The first line is argv[0]."
            >
              {(id) => (
                <textarea
                  id={id}
                  className="mono"
                  rows={3}
                  value={listToLines(form.programArguments)}
                  spellCheck={false}
                  placeholder={'/bin/sh\n-c\necho hello'}
                  onChange={(e) => set('programArguments', linesToList(e.target.value))}
                />
              )}
            </Field>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>When to run</legend>
        <Field label="Run at load">
          {(id) => (
            <TriSelect id={id} value={form.runAtLoad} onChange={(v) => set('runAtLoad', v)} />
          )}
        </Field>
        <Field
          label="Start interval (seconds)"
          error={errors.startInterval}
          hint={intervalHint(form.startInterval) || 'StartInterval'}
        >
          {(id) => (
            <input
              id={id}
              inputMode="numeric"
              value={form.startInterval}
              onChange={(e) => set('startInterval', e.target.value)}
            />
          )}
        </Field>

        <div className="field">
          <span className="field-label">Calendar (StartCalendarInterval, blank = any)</span>
          {form.startCalendarInterval.map((entry, i) => (
            <div className="calendar-row" key={i}>
              {CALENDAR_FIELDS.map((f) => {
                const error = errors[`startCalendarInterval.${i}.${f}`]
                return (
                  <label key={f} className={error ? 'mini has-error' : 'mini'} title={error}>
                    <span>{CALENDAR_LABELS[f]}</span>
                    <input
                      inputMode="numeric"
                      value={entry[f]}
                      aria-invalid={!!error}
                      onChange={(e) =>
                        set(
                          'startCalendarInterval',
                          form.startCalendarInterval.map((x, j) =>
                            j === i ? { ...x, [f]: e.target.value } : x
                          )
                        )
                      }
                    />
                  </label>
                )
              })}
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove calendar entry ${i + 1}`}
                onClick={() =>
                  set(
                    'startCalendarInterval',
                    form.startCalendarInterval.filter((_, j) => j !== i)
                  )
                }
              >
                ✕
              </button>
            </div>
          ))}
          {listErrors(errors, 'startCalendarInterval') && (
            <p className="field-error">{listErrors(errors, 'startCalendarInterval')}</p>
          )}
          <button
            type="button"
            className="link-button"
            onClick={() =>
              set('startCalendarInterval', [...form.startCalendarInterval, emptyCalendarEntry()])
            }
          >
            + Add time
          </button>
        </div>

        <Field label="Watch paths (one per line)" error={listErrors(errors, 'watchPaths')}>
          {(id) => (
            <textarea
              id={id}
              className="mono"
              rows={2}
              value={listToLines(form.watchPaths)}
              spellCheck={false}
              onChange={(e) => set('watchPaths', linesToList(e.target.value))}
            />
          )}
        </Field>

        <Field label="Keep alive" error={errors.keepAlive}>
          {(id) => (
            <select
              id={id}
              value={form.keepAlive.mode}
              onChange={(e) => setKeepAlive({ mode: e.target.value as KeepAliveForm['mode'] })}
            >
              {Object.entries(KEEP_ALIVE_LABELS).map(([mode, label]) => (
                <option key={mode} value={mode}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {form.keepAlive.mode === 'conditional' && (
          <div className="keepalive-conditions">
            <Field
              label="SuccessfulExit"
              hint="true: restart after exit 0 · false: after a failure"
            >
              {(id) => (
                <TriSelect
                  id={id}
                  value={form.keepAlive.successfulExit}
                  onChange={(v) => setKeepAlive({ successfulExit: v })}
                />
              )}
            </Field>
            <Field label="Crashed" hint="true: restart after a crash (signal)">
              {(id) => (
                <TriSelect
                  id={id}
                  value={form.keepAlive.crashed}
                  onChange={(v) => setKeepAlive({ crashed: v })}
                />
              )}
            </Field>
            {otherKeepAlive.length > 0 && (
              <p className="muted field-hint">Also kept: {otherKeepAlive.join(', ')}</p>
            )}
          </div>
        )}
      </fieldset>

      <details
        className="more-options"
        open={moreOpen || moreErrors}
        onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>More options</summary>
        <fieldset>
          <legend>Environment</legend>
          <Field label="Working directory" error={errors.workingDirectory}>
            {(id) => (
              <input
                id={id}
                className="mono"
                value={form.workingDirectory}
                spellCheck={false}
                onChange={(e) => set('workingDirectory', e.target.value)}
              />
            )}
          </Field>
          <div className="field">
            <span className="field-label">Environment variables</span>
            {form.environmentVariables.map((v, i) => {
              const update = (patch: Partial<typeof v>): void =>
                set(
                  'environmentVariables',
                  form.environmentVariables.map((x, j) => (j === i ? { ...x, ...patch } : x))
                )
              const error =
                errors[`environmentVariables.${i}.key`] ?? errors[`environmentVariables.${i}.value`]
              return (
                <div key={i}>
                  <div className="env-row">
                    <input
                      className="mono"
                      aria-label={`Variable ${i + 1} name`}
                      aria-invalid={!!error}
                      placeholder="NAME"
                      value={v.key}
                      spellCheck={false}
                      onChange={(e) => update({ key: e.target.value })}
                    />
                    <span className="muted">=</span>
                    <input
                      className="mono"
                      aria-label={`Variable ${i + 1} value`}
                      placeholder="value"
                      value={v.value}
                      spellCheck={false}
                      onChange={(e) => update({ value: e.target.value })}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove variable ${i + 1}`}
                      onClick={() =>
                        set(
                          'environmentVariables',
                          form.environmentVariables.filter((_, j) => j !== i)
                        )
                      }
                    >
                      ✕
                    </button>
                  </div>
                  {error && <p className="field-error">{error}</p>}
                </div>
              )
            })}
            <button
              type="button"
              className="link-button"
              onClick={() =>
                set('environmentVariables', [...form.environmentVariables, { key: '', value: '' }])
              }
            >
              + Add variable
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Logs</legend>
          <Field
            label={oneLog ? 'Log file' : 'Standard output'}
            error={errors.standardOutPath}
            hint={oneLog ? 'Output and errors go to this file.' : undefined}
          >
            {(id) => (
              <input
                id={id}
                className="mono"
                value={form.standardOutPath}
                spellCheck={false}
                onChange={(e) =>
                  onChange({
                    ...form,
                    standardOutPath: e.target.value,
                    standardErrorPath: oneLog ? e.target.value : form.standardErrorPath
                  })
                }
              />
            )}
          </Field>
          <label className="toggle">
            <input
              type="checkbox"
              checked={!oneLog}
              disabled={form.standardOutPath === ''}
              onChange={(e) =>
                set(
                  'standardErrorPath',
                  e.target.checked ? errorsLogNextTo(form.standardOutPath) : form.standardOutPath
                )
              }
            />
            Separate file for errors (stderr)
          </label>
          {!oneLog && (
            <Field label="Standard error" error={errors.standardErrorPath}>
              {(id) => (
                <input
                  id={id}
                  className="mono"
                  value={form.standardErrorPath}
                  spellCheck={false}
                  onChange={(e) => set('standardErrorPath', e.target.value)}
                />
              )}
            </Field>
          )}
          <p className="field-hint muted">
            Missing folders under ~/Library/Logs are created on save.
          </p>
        </fieldset>
      </details>

      {otherKeys.length > 0 && (
        <p className="muted field-hint">
          Other keys kept as-is: <span className="mono">{otherKeys.join(', ')}</span>
        </p>
      )}
    </div>
  )
}
