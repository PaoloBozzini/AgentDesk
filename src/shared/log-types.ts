export type LogStream = 'stdout' | 'stderr'

export type FileStatus =
  | { state: 'ok'; size: number }
  | { state: 'missing' }
  | { state: 'unreadable'; message: string }
  | { state: 'not-a-file' }

/** Events pushed from main for a live subscription. */
export type LogEvent =
  | { id: string; kind: 'reset'; text: string; truncated: boolean }
  | { id: string; kind: 'append'; text: string }
  | { id: string; kind: 'status'; status: FileStatus }
  | { id: string; kind: 'line'; line: UnifiedLogLine }
  | { id: string; kind: 'end'; error?: string }

export interface UnifiedLogLine {
  timestamp: string
  process: string
  pid?: number
  level: string
  subsystem?: string
  category?: string
  message: string
}

export type TailStart =
  | { ok: true; id: string; path: string }
  | { ok: false; reason: 'not-set' | 'relative-path' | 'error'; message: string }
