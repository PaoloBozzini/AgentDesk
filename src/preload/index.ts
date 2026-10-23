import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, IpcEvent, type AgentDeskApi } from '../shared/ipc-contract'

const api: AgentDeskApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo),
    copyText: (text) => ipcRenderer.invoke(IpcChannel.AppCopyText, text)
  },
  agents: {
    list: (options) => ipcRenderer.invoke(IpcChannel.AgentsList, options),
    read: (path) => ipcRenderer.invoke(IpcChannel.AgentsRead, path),
    control: (path, action) => ipcRenderer.invoke(IpcChannel.AgentsControl, path, action),
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
