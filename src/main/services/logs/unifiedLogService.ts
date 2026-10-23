import type {
  LogEvent,
  LogWindow,
  UnifiedLogLine,
  UnifiedLogStart
} from '../../../shared/log-types'
import { isValidLabel } from '../../../shared/label'
import { mergeByTime } from '../../../shared/log-sort'
import { readAgent, type AgentDir } from '../agents'
import { spawnTracked, type ProcessRegistry, type TrackedChild } from '../processes'
import {
  buildPredicate,
  LineSplitter,
  logShowArgs,
  logStreamArgs,
  parseLogLine,
  type LogQuery
} from './unifiedLog'

export const LOG_BIN = '/usr/bin/log'
export const MAX_LINES = 20_000
const FLUSH_MS = 100
const FLUSH_LINES = 200
const SEND_BATCH = 1000

export type UnifiedLogMode = { kind: 'show'; window: LogWindow } | { kind: 'stream' }

export interface UnifiedLogDeps {
  dirs: AgentDir[]
  registry: ProcessRegistry
  owner: number
  send: (event: LogEvent) => void
  /** Injected in tests. */
  spawn?: (file: string, args: string[]) => TrackedChild
}

interface RunResult {
  truncated: boolean
  error?: string
}

/** Runs one `log` child: parsed lines go to `onLines`; stops itself at MAX_LINES. */
function runLog(
  child: TrackedChild,
  onLines: (lines: UnifiedLogLine[]) => void
): Promise<RunResult> {
  const splitter = new LineSplitter()
  let count = 0
  let truncated = false
  let stderr = ''

  const take = (raw: string[]): void => {
    const lines: UnifiedLogLine[] = []
    for (const r of raw) {
      if (truncated) break
      const line = parseLogLine(r)
      if (!line) continue
      lines.push(line)
      if (++count >= MAX_LINES) {
        truncated = true
        void child.kill()
      }
    }
    if (lines.length) onLines(lines)
  }

  child.process.stdout?.setEncoding('utf8')
  child.process.stdout?.on('data', (chunk: string) => take(splitter.push(chunk)))
  child.process.stderr?.setEncoding('utf8')
  child.process.stderr?.on('data', (chunk: string) => {
    if (stderr.length < 8192) stderr += chunk
  })

  return new Promise((resolve) => {
    let done = false
    const finish = (code: number | null, error?: Error): void => {
      if (done) return
      done = true
      take(splitter.flush())
      const failed = !truncated && (error || (code !== 0 && code !== null))
      resolve({
        truncated,
        error: failed
          ? (error?.message ?? (stderr.trim() || `log exited with code ${code}`))
          : undefined
      })
    }
    child.process.once('close', (code) => finish(code))
    child.process.once('error', (e) => finish(null, e))
  })
}

/** `log show` / `log stream` for one agent, delivered to the owner as events. */
export async function startUnifiedLog(
  agentPath: unknown,
  mode: UnifiedLogMode,
  deps: UnifiedLogDeps
): Promise<UnifiedLogStart> {
  let query: LogQuery
  try {
    const detail = await readAgent(agentPath, deps.dirs)
    const label = detail.summary.label
    if (!isValidLabel(label)) return { ok: false, message: 'The plist has no valid Label' }
    query = buildPredicate(label, detail.data)
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }

  const spawn = deps.spawn ?? spawnTracked
  const children: TrackedChild[] = []
  const id = deps.registry.add(deps.owner, () => children.forEach((c) => void c.kill()))
  const finish = (count: number, results: RunResult[]): void => {
    deps.registry.forget(id)
    const errors = results.map((r) => r.error).filter(Boolean)
    deps.send({
      id,
      kind: 'end',
      count,
      truncated: results.some((r) => r.truncated),
      error: errors.length ? errors.join('\n') : undefined
    })
  }

  if (mode.kind === 'stream') {
    const child = spawn(LOG_BIN, logStreamArgs(query.predicate))
    children.push(child)
    let batch: UnifiedLogLine[] = []
    let count = 0
    let timer: NodeJS.Timeout | null = null
    const flush = (): void => {
      if (timer) clearTimeout(timer)
      timer = null
      if (batch.length) deps.send({ id, kind: 'lines', lines: batch })
      batch = []
    }
    void runLog(child, (lines) => {
      batch.push(...lines)
      count += lines.length
      if (batch.length >= FLUSH_LINES) flush()
      else if (!timer) timer = setTimeout(flush, FLUSH_MS)
    }).then((result) => {
      flush()
      finish(count, [result])
    })
  } else {
    // One process per predicate part, in parallel. Each part's results are sent as soon as
    // it finishes (the launchd part can take ~a minute for 24 h); the renderer merges by time.
    let done = 0
    let sent = 0
    const total = query.parts.length
    const runs = query.parts.map((part) => {
      const child = spawn(LOG_BIN, logShowArgs(mode.window, part))
      children.push(child)
      const lines: UnifiedLogLine[] = []
      return runLog(child, (batch) => lines.push(...batch)).then((result) => {
        const sorted = mergeByTime(lines)
        for (let i = 0; i < sorted.length; i += SEND_BATCH) {
          deps.send({ id, kind: 'lines', lines: sorted.slice(i, i + SEND_BATCH) })
        }
        sent += sorted.length
        deps.send({ id, kind: 'progress', done: ++done, total })
        return result
      })
    })
    void Promise.all(runs).then((results) => finish(sent, results))
  }

  return { ok: true, id, predicate: query.predicate, note: query.note }
}
