import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, IpcEvent, type AgentDeskApi } from '../shared/ipc-contract'

const api: AgentDeskApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo)
  },
  agents: {
    list: (options) => ipcRenderer.invoke(IpcChannel.AgentsList, options),
    read: (path) => ipcRenderer.invoke(IpcChannel.AgentsRead, path),
    onChanged: (callback) => {
      // Never hand the IpcRendererEvent to the renderer
      const listener = (): void => callback()
      ipcRenderer.on(IpcEvent.AgentsChanged, listener)
      return () => {
        ipcRenderer.removeListener(IpcEvent.AgentsChanged, listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('agentDesk', api)
