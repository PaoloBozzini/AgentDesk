import type { PlistDict, PlistFormat } from './plist-types'

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
}

export interface AgentDetail {
  summary: AgentSummary
  data: PlistDict
  /** Original XML, or normalized XML when the file is binary. */
  xml: string
}
