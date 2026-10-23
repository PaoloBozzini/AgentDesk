import type { AgentDetail, AgentSummary } from './agent-types'

/**
 * Single source of truth for the renderer <-> main API.
 * Main registers a handler per channel; preload exposes `window.agentDesk`
 * built from these types. The renderer never sees raw ipcRenderer.
 */

export const IpcChannel = {
  AppGetInfo: 'app:get-info',
  AgentsList: 'agents:list',
  AgentsRead: 'agents:read'
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
  }
  agents: {
    list(options?: ListAgentsOptions): Promise<AgentSummary[]>
    read(path: string): Promise<AgentDetail>
    /** Called when files in ~/Library/LaunchAgents change. Returns an unsubscribe function. */
    onChanged(callback: () => void): () => void
  }
}
