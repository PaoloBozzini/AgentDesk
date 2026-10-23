import type { AgentDeskApi } from '../shared/ipc-contract'

declare global {
  interface Window {
    agentDesk: AgentDeskApi
  }
}
