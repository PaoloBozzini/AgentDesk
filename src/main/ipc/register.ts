import { app, clipboard, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { homedir, userInfo } from 'os'
import { join } from 'path'
import { IpcChannel, IpcEvent, type AppInfo, type IpcChannelName } from '../../shared/ipc-contract'
import { isTrustedRendererUrl } from '../security/policy'
import type { AgentListResult } from '../../shared/agent-types'
import type { LintResult } from '../../shared/plist-types'
import { isAgentAction } from '../../shared/control-types'
import {
  agentDirsFor,
  listAgents,
  readAgent,
  userAgentsDir,
  type AgentDir
} from '../services/agents'
import { convertPlistInput, createAgent } from '../services/create'
import { deleteAgent } from '../services/delete'
import { parseDomainPrint } from '../services/launchctl/domainParser'
import { controlAgent } from '../services/control'
import { backupsDir } from '../services/backup'
import { appSupportDir, writeRootsFor } from '../services/paths'
import { saveAgent } from '../services/save'
import { lintPlist } from '../services/plutil'
import { registry, trackOwner } from '../services/registry'
import { isLogStream, startFileTail } from '../services/logs/tailService'
import { isLogWindow } from '../services/logs/unifiedLog'
import { startUnifiedLog, type UnifiedLogDeps } from '../services/logs/unifiedLogService'
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
    trackOwner(event.sender)
    return fn(event, ...args)
  })
}

export function registerIpcHandlers(): void {
  handle(IpcChannel.AppGetInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    uid: process.getuid?.() ?? -1,
    home: homedir(),
    userName: userInfo().username
  }))

  handle(IpcChannel.AppCopyText, (_e, text) => {
    if (typeof text !== 'string' || text.length > 1_000_000) throw new Error('Invalid text')
    clipboard.writeText(text)
  })

  handle(IpcChannel.SubscriptionDispose, (event, id) => {
    // Only the window that created a subscription may end it
    if (typeof id === 'string' && registry.owns(id, event.sender.id)) registry.dispose(id)
  })

  /** Log subscriptions: readable for every agent folder, owned by the calling window. */
  const subscriber = (sender: WebContents): UnifiedLogDeps => ({
    dirs: agentDirsFor({ includeSystem: true }),
    registry,
    owner: sender.id,
    send: (e) => {
      if (!sender.isDestroyed()) sender.send(IpcEvent.LogsEvent, e)
    }
  })

  handle(IpcChannel.LogsTailFile, (event, agentPath, stream) => {
    if (!isLogStream(stream)) throw new Error('Invalid stream')
    return startFileTail(agentPath, stream, subscriber(event.sender))
  })

  handle(IpcChannel.LogsShow, (event, agentPath, window) => {
    if (!isLogWindow(window)) throw new Error('Invalid window')
    return startUnifiedLog(agentPath, { kind: 'show', window }, subscriber(event.sender))
  })

  handle(IpcChannel.LogsStream, (event, agentPath) =>
    startUnifiedLog(agentPath, { kind: 'stream' }, subscriber(event.sender))
  )

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

  const userWritable = (): AgentDir[] => [{ dir: userAgentsDir(), scope: 'user' }]

  handle(IpcChannel.AgentsControl, (_e, path, action) => {
    if (!isAgentAction(action)) throw new Error('Unknown action')
    return controlAgent(path, action, { launchctl, writableDirs: userWritable() })
  })

  const lint = (xml: string): Promise<LintResult> => {
    const home = homedir()
    return lintPlist(xml, { tempDir: join(appSupportDir(home), 'tmp'), roots: writeRootsFor(home) })
  }

  handle(IpcChannel.AgentsLint, (_e, xml) => {
    if (typeof xml !== 'string') throw new Error('Invalid plist text')
    return lint(xml)
  })

  handle(IpcChannel.AgentsCreate, (_e, input, options) =>
    createAgent(input, options, {
      agentsDir: userAgentsDir(),
      roots: writeRootsFor(homedir()),
      lint,
      load: (path) => controlAgent(path, 'load', { launchctl, writableDirs: userWritable() })
    })
  )

  handle(IpcChannel.PlistConvert, (_e, input) => convertPlistInput(input))

  handle(IpcChannel.AgentsSave, (_e, path, input, options) =>
    saveAgent(path, input, options, {
      writableDirs: userWritable(),
      roots: writeRootsFor(homedir()),
      backupDir: backupsDir(homedir()),
      lint
    })
  )

  handle(IpcChannel.AgentsDelete, (_e, path) =>
    deleteAgent(path, {
      writableDirs: userWritable(),
      roots: writeRootsFor(homedir()),
      backupDir: backupsDir(homedir()),
      isLoaded: async (label) =>
        parseDomainPrint(await launchctl.run(launchctl.commands.printDomain())).services.has(label),
      unload: (p) => controlAgent(p, 'unload', { launchctl, writableDirs: userWritable() }),
      trash: (p) => shell.trashItem(p)
    })
  )
}
