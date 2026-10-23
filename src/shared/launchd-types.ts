/** Status of one service from `launchctl print gui/<uid>/<label>`. Every field is optional: the format is not stable. */
export interface ServiceStatus {
  label?: string
  /** Raw launchd state, e.g. "running", "not running", "waiting", "spawn scheduled". */
  state?: string
  running: boolean
  pid?: number
  runs?: number
  /** Undefined when the service never exited or launchd didn't report one. */
  lastExitCode?: number
  /** Text after the code, e.g. "EX_CONFIG" in "78: EX_CONFIG". */
  lastExitReason?: string
  neverExited: boolean
  /** e.g. { name: "Killed", number: 9 } from "last terminating signal = Killed: 9". */
  lastSignal?: { name: string; number?: number }
  program?: string
  arguments?: string[]
  path?: string
  type?: string
  stdoutPath?: string
  stderrPath?: string
  /** All top-level `key = value` pairs, for display and forward compatibility. */
  fields: Record<string, string>
}
