import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type AgentDeskApi } from '../shared/ipc-contract'

const api: AgentDeskApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo)
  },
  agents: {
    list: (options) => ipcRenderer.invoke(IpcChannel.AgentsList, options),
    read: (path) => ipcRenderer.invoke(IpcChannel.AgentsRead, path)
  }
}

contextBridge.exposeInMainWorld('agentDesk', api)
