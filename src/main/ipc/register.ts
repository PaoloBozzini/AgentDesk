import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { IpcChannel, type AppInfo, type IpcChannelName } from '../../shared/ipc-contract'
import { isTrustedRendererUrl } from '../security/policy'
import { listAgents, userAgentsDir } from '../services/agents'

const rendererIndexPath = join(__dirname, '../renderer/index.html')

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? ''
  const trusted = isTrustedRendererUrl(url, {
    devServerUrl: app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'],
    rendererIndexPath
  })
  if (!trusted) throw new Error(`Rejected IPC from untrusted sender: ${url}`)
}

/**
 * Register a handler that only answers our own renderer. Each handler is
 * responsible for validating its own arguments (renderer input is untrusted).
 */
export function handle<T>(
  channel: IpcChannelName,
  fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T
): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event)
    return fn(event, ...args)
  })
}

export function registerIpcHandlers(): void {
  handle(IpcChannel.AppGetInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    uid: process.getuid?.() ?? -1
  }))

  handle(IpcChannel.AgentsList, () => listAgents([{ dir: userAgentsDir(), scope: 'user' }]))
}
