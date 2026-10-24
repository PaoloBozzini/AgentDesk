/**
 * Defaults for new agents: a suggested label and log paths under
 * ~/Library/Logs/<label>/. Pure; the log folder itself is created on save by
 * main (services/logDirs.ts).
 */
import { emptyAgentForm, type AgentForm } from './agent-form'
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

/**
 * One log for both streams: many tools (brew, git, curl…) write normal progress
 * to stderr, so split logs mostly hide output in the wrong place.
 */
export function defaultLogPaths(home: string, label: string): LogPaths {
  const file = `${home.replace(/\/+$/, '')}/Library/Logs/${label}/output.log`
  return { stdout: file, stderr: file }
}

/**
 * PATH for new script agents. launchd's default is /usr/bin:/bin:/usr/sbin:/sbin,
 * which misses Homebrew (Apple silicon and Intel locations).
 */
export const SCRIPT_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'

export const SCRIPT_STUB = [
  "# Commands to run. Output goes to the agent's log.",
  'echo "Hello from $(whoami) at $(date)"',
  ''
].join('\n')

/** Starting point for a new agent: Script mode with a stub, PATH that includes Homebrew. */
export function newAgentForm(): AgentForm {
  return {
    ...emptyAgentForm(),
    commandMode: 'script',
    script: SCRIPT_STUB,
    environmentVariables: [{ key: 'PATH', value: SCRIPT_PATH }]
  }
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
