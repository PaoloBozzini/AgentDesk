import { isAbsolute } from 'path'
import type { LogEvent, LogStream, TailStart } from '../../../shared/log-types'
import { readAgent, type AgentDir } from '../agents'
import type { ProcessRegistry } from '../processes'
import { FileTail } from './fileTail'

const KEYS: Record<LogStream, string> = {
  stdout: 'StandardOutPath',
  stderr: 'StandardErrorPath'
}

export function isLogStream(value: unknown): value is LogStream {
  return value === 'stdout' || value === 'stderr'
}

/**
 * Start tailing an agent's StandardOutPath / StandardErrorPath. The path comes
 * from the plist on disk (read-only use; may point anywhere the user chose).
 */
export async function startFileTail(
  agentPath: unknown,
  stream: LogStream,
  deps: {
    dirs: AgentDir[]
    registry: ProcessRegistry
    owner: number
    send: (event: LogEvent) => void
    pollMs?: number
  }
): Promise<TailStart> {
  let path: unknown
  try {
    path = (await readAgent(agentPath, deps.dirs)).data[KEYS[stream]]
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message }
  }
  if (typeof path !== 'string' || path === '') {
    return { ok: false, reason: 'not-set', message: `${KEYS[stream]} is not set` }
  }
  if (!isAbsolute(path)) {
    return {
      ok: false,
      reason: 'relative-path',
      message: `${KEYS[stream]} is not absolute: ${path}`
    }
  }

  let id = ''
  const tail = new FileTail(
    path,
    {
      onReset: (text, truncated) => deps.send({ id, kind: 'reset', text, truncated }),
      onAppend: (text) => deps.send({ id, kind: 'append', text }),
      onStatus: (status) => deps.send({ id, kind: 'status', status })
    },
    { pollMs: deps.pollMs }
  )
  id = deps.registry.add(deps.owner, () => tail.stop())
  void tail.start()
  return { ok: true, id, path }
}
