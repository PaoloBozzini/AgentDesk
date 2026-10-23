import type { AgentDetail, AgentListResult } from './agent-types'
import type { ActionResult, AgentAction } from './control-types'

/**
 * Single source of truth for the renderer <-> main API.
 * Main registers a handler per channel; preload exposes `window.agentDesk`
 * built from these types. The renderer never sees raw ipcRenderer.
 */

export const IpcChannel = {
  AppGetInfo: 'app:get-info',
  AppCopyText: 'app:copy-text',
  AgentsList: 'agents:list',
  AgentsRead: 'agents:read',
  AgentsControl: 'agents:control'
} as const

/** Main -> renderer notifications. */
export const IpcEvent = {
  AgentsChanged: 'agents:changed'
} as const

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]

export interface ListAgentsOptions {
  /** Also list /Library/LaunchAgents and /Library/LaunchDaemons (read-only). */
  includeSystem?: boolean
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  uid: number
}

export interface AgentDeskApi {
  app: {
    getInfo(): Promise<AppInfo>
    /** Clipboard write via main (the renderer has no clipboard permission). */
    copyText(text: string): Promise<void>
  }
  agents: {
    list(options?: ListAgentsOptions): Promise<AgentListResult>
    read(path: string): Promise<AgentDetail>
    /** launchctl action on a user agent. Never rejects for launchctl failures: see ActionResult. */
    control(path: string, action: AgentAction): Promise<ActionResult>
    /** Called when files in ~/Library/LaunchAgents change. Returns an unsubscribe function. */
    onChanged(callback: () => void): () => void
  }
}
