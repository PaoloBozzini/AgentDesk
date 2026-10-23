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

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]

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
    list(): Promise<AgentSummary[]>
    read(path: string): Promise<AgentDetail>
  }
}
