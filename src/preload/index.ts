import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type AgentDeskApi } from '../shared/ipc-contract'

const api: AgentDeskApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo)
  }
}

contextBridge.exposeInMainWorld('agentDesk', api)
