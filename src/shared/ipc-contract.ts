import type { AgentDetail, AgentListResult } from './agent-types'
import type { ActionResult, AgentAction } from './control-types'
import type {
  CreateAgentOptions,
  CreateAgentResult,
  DeleteAgentResult,
  PlistConvertResult,
  PlistInput,
  SaveAgentOptions,
  SaveAgentResult
} from './edit-types'
import type { LintResult } from './plist-types'
import type { LogEvent, LogStream, LogWindow, TailStart, UnifiedLogStart } from './log-types'

/**
 * Single source of truth for the renderer <-> main API.
 * Main registers a handler per channel; preload exposes `window.agentDesk`
 * built from these types. The renderer never sees raw ipcRenderer.
 */

export const IpcChannel = {
  AppGetInfo: 'app:get-info',
  AppCopyText: 'app:copy-text',
  AppRevealBackups: 'app:reveal-backups',
  AgentsList: 'agents:list',
  AgentsRead: 'agents:read',
  AgentsControl: 'agents:control',
  AgentsLint: 'agents:lint',
  AgentsCreate: 'agents:create',
  AgentsSave: 'agents:save',
  AgentsDelete: 'agents:delete',
  PlistConvert: 'plist:convert',
  SubscriptionDispose: 'subscription:dispose',
  LogsTailFile: 'logs:tail-file',
  LogsShow: 'logs:show',
  LogsStream: 'logs:stream'
} as const

/** Main -> renderer notifications. */
export const IpcEvent = {
  AgentsChanged: 'agents:changed',
  LogsEvent: 'logs:event'
} as const

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]

export interface ListAgentsOptions {
  /** Also list /Library/LaunchAgents and /Library/LaunchDaemons (read-only). */
  includeSystem?: boolean
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  uid: number
  /** Home directory and short user name, for new-agent defaults. */
  home: string
  userName: string
}

export interface AgentDeskApi {
  logs: {
    /** Live tail of the agent's StandardOutPath / StandardErrorPath. */
    tailFile(agentPath: string, stream: LogStream): Promise<TailStart>
    /** `log show --last <window>` for the agent; lines arrive as events. */
    show(agentPath: string, window: LogWindow): Promise<UnifiedLogStart>
    /** Live `log stream` for the agent until disposed. */
    stream(agentPath: string): Promise<UnifiedLogStart>
    /** All log subscription events; filter by `id`. Returns an unsubscribe function. */
    onEvent(callback: (event: LogEvent) => void): () => void
  }
  plist: {
    /** Parse XML text, or serialize a dict (same serializer as saves). Nothing is written. */
    convert(input: PlistInput): Promise<PlistConvertResult>
  }
  subscriptions: {
    /** Stop a live subscription (log tail / stream) and release its process. */
    dispose(id: string): Promise<void>
  }
  app: {
    getInfo(): Promise<AppInfo>
    /** Clipboard write via main (the renderer has no clipboard permission). */
    copyText(text: string): Promise<void>
    /** Open ~/Library/Application Support/Agent Desk/backups in Finder (created if missing). */
    revealBackups(): Promise<void>
  }
  agents: {
    list(options?: ListAgentsOptions): Promise<AgentListResult>
    read(path: string): Promise<AgentDetail>
    /** launchctl action on a user agent. Never rejects for launchctl failures: see ActionResult. */
    control(path: string, action: AgentAction): Promise<ActionResult>
    /** `plutil -lint` on plist text (nothing is saved). */
    lint(xml: string): Promise<LintResult>
    /** Validate, lint and write ~/Library/LaunchAgents/<Label>.plist; never overwrites. */
    create(input: PlistInput, options: CreateAgentOptions): Promise<CreateAgentResult>
    /** Conflict check, validate, lint, back up, then replace the user agent's file. */
    save(path: string, input: PlistInput, options: SaveAgentOptions): Promise<SaveAgentResult>
    /** Bootout if loaded, back up, move the file to the Trash. User agents only. */
    delete(path: string): Promise<DeleteAgentResult>
    /** Called when files in ~/Library/LaunchAgents change. Returns an unsubscribe function. */
    onChanged(callback: () => void): () => void
  }
}
