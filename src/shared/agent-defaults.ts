/**
 * Defaults for new agents: a suggested label and log paths under
 * ~/Library/Logs/<label>/. Pure; the log folder itself is created on save by
 * main (services/logDirs.ts).
 */
import type { AgentForm } from './agent-form'
import { isValidLabel, MAX_LABEL_LENGTH } from './label'

/**
 * Lowercase ASCII slug usable as one label segment: accents stripped, runs of
 * anything else collapsed to `-`. Empty when nothing usable is left.
 */
export function labelSegment(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
}

/** `com.<username>.<name>`, always a valid label. */
export function suggestLabel(userName: string, name: string): string {
  const prefix = `com.${(labelSegment(userName) || 'user').slice(0, 64)}.`
  const label = prefix + (labelSegment(name) || 'agent').slice(0, MAX_LABEL_LENGTH - prefix.length)
  return isValidLabel(label) ? label : 'com.user.agent'
}

export interface LogPaths {
  stdout: string
  stderr: string
}

export function defaultLogPaths(home: string, label: string): LogPaths {
  const dir = `${home.replace(/\/+$/, '')}/Library/Logs/${label}`
  return { stdout: `${dir}/stdout.log`, stderr: `${dir}/stderr.log` }
}

/**
 * Fills blank log paths with the defaults for the form's label. Paths the user
 * typed are kept. No-op while the label is invalid.
 */
export function withDefaultLogPaths(form: AgentForm, home: string): AgentForm {
  if (!isValidLabel(form.label)) return form
  const { stdout, stderr } = defaultLogPaths(home, form.label)
  return {
    ...form,
    standardOutPath: form.standardOutPath || stdout,
    standardErrorPath: form.standardErrorPath || stderr
  }
}
