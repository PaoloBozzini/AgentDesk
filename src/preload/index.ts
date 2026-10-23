import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type AgentDeskApi } from '../shared/ipc-contract'

const api: AgentDeskApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo)
  },
  agents: {
    list: () => ipcRenderer.invoke(IpcChannel.AgentsList)
  }
}

contextBridge.exposeInMainWorld('agentDesk', api)
