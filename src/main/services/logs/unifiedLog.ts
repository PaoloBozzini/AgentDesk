import { basename } from 'path'
import type { LogWindow, UnifiedLogLine } from '../../../shared/log-types'
import { assertValidLabel } from '../../../shared/label'
import type { PlistDict } from '../plist'

export const LOG_WINDOWS = ['15m', '1h', '24h'] as const satisfies readonly LogWindow[]

export function isLogWindow(value: unknown): value is LogWindow {
  return typeof value === 'string' && (LOG_WINDOWS as readonly string[]).includes(value)
}

/** Programs whose process name/path would match far more than this agent. */
const GENERIC_EXECUTABLES = new Set([
  'sh',
  'bash',
  'zsh',
  'dash',
  'ksh',
  'tcsh',
  'csh',
  'fish',
  'env',
  'open',
  'osascript',
  'caffeinate',
  'nohup',
  'arch',
  'python',
  'python2',
  'python3',
  'node',
  'ruby',
  'perl',
  'php',
  'java',
  'deno',
  'bun'
])

/** NSPredicate string literal: escape backslashes and double quotes. */
export function predicateString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function executableOf(data: PlistDict): string | undefined {
  const args = data.ProgramArguments
  const first = Array.isArray(args) && typeof args[0] === 'string' ? args[0] : undefined
  const program = typeof data.Program === 'string' ? data.Program : first
  return program || undefined
}

export interface LogQuery {
  /**
   * Independent predicates. `log show` runs one process per part: OR-ing them
   * into one predicate made a 24 h query take ~72 s instead of ~2 s per part
   * (measured on macOS 14.7), apparently defeating the log index.
   */
  parts: string[]
  /** All parts OR-ed together: shown to the user and used by `log stream`. */
  predicate: string
  /** Explains what is (not) included. */
  note?: string
}

export function buildPredicate(label: string, data: PlistDict): LogQuery {
  const launchd = `(process == "launchd" AND eventMessage CONTAINS ${predicateString(assertValidLabel(label))})`
  const only = (note: string): LogQuery => ({ parts: [launchd], predicate: launchd, note })
  const exe = executableOf(data)
  if (!exe) return only('No Program or ProgramArguments: showing launchd messages only.')
  const name = basename(exe)
  if (GENERIC_EXECUTABLES.has(name.replace(/[\d.]+$/, '')) || GENERIC_EXECUTABLES.has(name)) {
    return only(
      `Runs through ${name}: its messages can't be told apart from other ${name} processes, so only launchd messages are shown.`
    )
  }
  // `process ==` rather than `processImagePath ==`: by image path a 24 h query took ~69 s
  // and missed apps that run from a different copy of their binary (e.g. auto-updaters).
  const proc = `process == ${predicateString(name)}`
  return {
    parts: [launchd, proc],
    predicate: `${launchd} OR ${proc}`,
    note: `Also shows anything logged by processes named “${name}”.`
  }
}

export function logShowArgs(window: LogWindow, predicate: string): string[] {
  return ['show', '--last', window, '--style', 'ndjson', '--predicate', predicate]
}

export function logStreamArgs(predicate: string): string[] {
  return ['stream', '--style', 'ndjson', '--predicate', predicate]
}

/** One NDJSON line from `log show/stream --style ndjson`. Non-log events and junk → null. */
export function parseLogLine(line: string): UnifiedLogLine | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (raw.eventType !== 'logEvent' || typeof raw.eventMessage !== 'string') return null
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v !== '' ? v : undefined
  const path = str(raw.processImagePath)
  return {
    timestamp: str(raw.timestamp) ?? '',
    process: path ? basename(path) : '?',
    pid: typeof raw.processID === 'number' ? raw.processID : undefined,
    level: str(raw.messageType) ?? 'Default',
    subsystem: str(raw.subsystem),
    category: str(raw.category),
    message: raw.eventMessage
  }
}

/** Splits a byte stream into complete lines, keeping the partial tail for the next chunk. */
export class LineSplitter {
  private rest = ''

  push(chunk: string): string[] {
    const parts = (this.rest + chunk).split('\n')
    this.rest = parts.pop() ?? ''
    return parts
  }

  flush(): string[] {
    const last = this.rest
    this.rest = ''
    return last ? [last] : []
  }
}
