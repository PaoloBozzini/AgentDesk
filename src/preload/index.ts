import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, IpcEvent, type AgentDeskApi } from '../shared/ipc-contract'

const api: AgentDeskApi = {
  logs: {
    tailFile: (agentPath, stream) => ipcRenderer.invoke(IpcChannel.LogsTailFile, agentPath, stream),
    show: (agentPath, window) => ipcRenderer.invoke(IpcChannel.LogsShow, agentPath, window),
    stream: (agentPath) => ipcRenderer.invoke(IpcChannel.LogsStream, agentPath),
    onEvent: (callback) => {
      const listener = (_e: unknown, event: Parameters<typeof callback>[0]): void => callback(event)
      ipcRenderer.on(IpcEvent.LogsEvent, listener)
      return () => {
        ipcRenderer.removeListener(IpcEvent.LogsEvent, listener)
      }
    }
  },
  plist: {
    convert: (input) => ipcRenderer.invoke(IpcChannel.PlistConvert, input)
  },
  subscriptions: {
    dispose: (id) => ipcRenderer.invoke(IpcChannel.SubscriptionDispose, id)
  },
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo),
    copyText: (text) => ipcRenderer.invoke(IpcChannel.AppCopyText, text),
    revealBackups: () => ipcRenderer.invoke(IpcChannel.AppRevealBackups)
  },
  agents: {
    list: (options) => ipcRenderer.invoke(IpcChannel.AgentsList, options),
    read: (path) => ipcRenderer.invoke(IpcChannel.AgentsRead, path),
    control: (path, action) => ipcRenderer.invoke(IpcChannel.AgentsControl, path, action),
    lint: (xml) => ipcRenderer.invoke(IpcChannel.AgentsLint, xml),
    create: (input, options) => ipcRenderer.invoke(IpcChannel.AgentsCreate, input, options),
    save: (path, input, options) => ipcRenderer.invoke(IpcChannel.AgentsSave, path, input, options),
    delete: (path) => ipcRenderer.invoke(IpcChannel.AgentsDelete, path),
    readScriptFile: (path, file) => ipcRenderer.invoke(IpcChannel.AgentsReadScriptFile, path, file),
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
