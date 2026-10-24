import type { PlistDict, PlistFormat, RealHint } from './plist-types'

export type AgentScope = 'user' | 'global-agent' | 'global-daemon'

export interface AgentSummary {
  /** Absolute path of the plist file. */
  path: string
  fileName: string
  scope: AgentScope
  /** System folders are always read-only. */
  readOnly: boolean
  label?: string
  program?: string
  programArguments?: string[]
  /** File name differs from `<Label>.plist`. Shown as a warning; never auto-renamed. */
  labelMismatch: boolean
  format?: PlistFormat
  /** Set when the file could not be read or parsed. */
  error?: string
  /** The plist's own `Disabled` key, if present. */
  disabledKey?: boolean
  /** launchd state; undefined when unknown (no label, or launchctl failed). */
  runtime?: AgentRuntime
}

export interface AgentRuntime {
  loaded: boolean
  running: boolean
  pid?: number
  /** Last exit status; negative = terminated by that signal. */
  lastExitStatus?: number
  /** Raw status token from launchctl ("-", "0", "(pe)", …). */
  statusText?: string
  enabled: boolean
  /** Where `enabled` comes from: launchctl override db, the plist's Disabled key, or the default. */
  enabledSource: 'override' | 'plist' | 'default'
}

export interface AgentListResult {
  agents: AgentSummary[]
  /** Set when launchctl status couldn't be read; agents are still listed. */
  statusError?: string
}

export interface AgentDetail {
  summary: AgentSummary
  data: PlistDict
  /** Original XML, or normalized XML when the file is binary. */
  xml: string
  /** `<real>`s in `xml`, so form-mode saves keep them (see RealHint). */
  realHints: RealHint[]
  /** sha256 of the file bytes, passed back on save to detect outside changes. */
  hash: string
}
