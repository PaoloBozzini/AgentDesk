import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { IpcChannel, type AppInfo, type IpcChannelName } from '../../shared/ipc-contract'
import { isTrustedRendererUrl } from '../security/policy'
import type { AgentListResult } from '../../shared/agent-types'
import { agentDirsFor, listAgents, readAgent } from '../services/agents'
import { Launchctl } from '../services/launchctl/runner'
import { attachRuntime, readDomains } from '../services/status'

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

  const launchctl = new Launchctl({ uid: process.getuid!() })

  handle(IpcChannel.AgentsList, async (_e, options): Promise<AgentListResult> => {
    const dirs = agentDirsFor(options)
    const includeSystem = dirs.some((d) => d.scope === 'global-daemon')
    const [agents, domains] = await Promise.all([
      listAgents(dirs),
      readDomains(launchctl, includeSystem).catch((e: Error) => e)
    ])
    if (domains instanceof Error) return { agents, statusError: domains.message }
    return { agents: attachRuntime(agents, domains) }
  })
  handle(IpcChannel.AgentsRead, (_e, path) =>
    readAgent(path, agentDirsFor({ includeSystem: true }))
  )
}
