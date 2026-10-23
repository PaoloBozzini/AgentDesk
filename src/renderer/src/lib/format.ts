import type { AgentRuntime, AgentSummary } from '../../../shared/agent-types'

export function programLine(agent: AgentSummary): string {
  if (agent.programArguments?.length) return agent.programArguments.join(' ')
  return agent.program ?? ''
}

const SIGNALS: Record<number, string> = {
  1: 'SIGHUP',
  2: 'SIGINT',
  3: 'SIGQUIT',
  6: 'SIGABRT',
  9: 'SIGKILL',
  10: 'SIGBUS',
  11: 'SIGSEGV',
  13: 'SIGPIPE',
  14: 'SIGALRM',
  15: 'SIGTERM'
}

export function signalName(n: number): string {
  return SIGNALS[n] ?? `signal ${n}`
}

/** Last exit column: code, signal name for negative statuses, raw token otherwise. */
export function formatExit(runtime: AgentRuntime | undefined): string {
  if (!runtime?.loaded) return ''
  const { lastExitStatus, statusText } = runtime
  if (lastExitStatus !== undefined) {
    return lastExitStatus < 0 ? signalName(-lastExitStatus) : String(lastExitStatus)
  }
  return statusText && statusText !== '-' ? statusText : ''
}

/** Loaded and last run ended badly (non-zero exit or signal). */
export function isFailed(runtime: AgentRuntime | undefined): boolean {
  return Boolean(
    runtime?.loaded && runtime.lastExitStatus !== undefined && runtime.lastExitStatus !== 0
  )
}
