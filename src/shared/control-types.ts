export const AGENT_ACTIONS = [
  'load',
  'unload',
  'start',
  'restart',
  'reload',
  'enable',
  'disable'
] as const

export type AgentAction = (typeof AGENT_ACTIONS)[number]

export function isAgentAction(value: unknown): value is AgentAction {
  return typeof value === 'string' && (AGENT_ACTIONS as readonly string[]).includes(value)
}

/** Everything the UI needs to explain a failed launchctl call. */
export interface ActionError {
  /** Human-readable cause, e.g. "Already loaded". */
  summary: string
  /** Optional hint for what to do next. */
  hint?: string
  /** The launchctl command that failed, as argv (empty if it failed before running one). */
  command: string[]
  exitCode: number | null
  stdout: string
  stderr: string
}

export type ActionResult = { ok: true } | { ok: false; error: ActionError }
