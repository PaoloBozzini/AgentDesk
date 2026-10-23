import { useEffect, useState } from 'react'
import type { LogWindow, UnifiedLogLine, UnifiedLogStart } from '../../../shared/log-types'
import { mergeByTime } from '../../../shared/log-sort'
import { ensureLogHub, listen } from '../lib/logHub'

/** Rows kept in the view (newest kept). */
export const MAX_VIEW_LINES = 5000

// `log stream` (live mode) is added in #22
export type UnifiedLogRequest = { kind: 'show'; window: LogWindow; nonce: number }

export interface UnifiedLogState {
  lines: UnifiedLogLine[]
  running: boolean
  predicate?: string
  note?: string
  error?: string
  truncated: boolean
  /** Lines dropped from the top of the view to stay under MAX_VIEW_LINES. */
  dropped: number
  /** For `show`: how many of the parallel queries have finished. */
  progress?: { done: number; total: number }
}

const INITIAL: UnifiedLogState = { lines: [], running: true, truncated: false, dropped: 0 }

function start(agentPath: string, request: UnifiedLogRequest): Promise<UnifiedLogStart> {
  return window.agentDesk.logs.show(agentPath, request.window)
}

/** Runs one `log show`; mount with a `key` per request so state starts fresh. */
export function useUnifiedLog(agentPath: string, request: UnifiedLogRequest): UnifiedLogState {
  const [state, setState] = useState<UnifiedLogState>(INITIAL)
  const requestKey = JSON.stringify(request)

  useEffect(() => {
    let cancelled = false
    let id: string | undefined
    let unlisten: (() => void) | undefined
    ensureLogHub()

    start(agentPath, JSON.parse(requestKey)).then(
      (result) => {
        if (!result.ok) {
          if (!cancelled) setState({ ...INITIAL, running: false, error: result.message })
          return
        }
        id = result.id
        if (cancelled) {
          void window.agentDesk.subscriptions.dispose(id)
          return
        }
        setState((s) => ({ ...s, predicate: result.predicate, note: result.note }))
        unlisten = listen(result.id, (event) => {
          setState((s) => {
            if (event.kind === 'lines') {
              // Parts of a `show` arrive separately: keep the view in time order
              const all = mergeByTime(s.lines, event.lines)
              const over = Math.max(0, all.length - MAX_VIEW_LINES)
              return { ...s, lines: over ? all.slice(over) : all, dropped: s.dropped + over }
            }
            if (event.kind === 'progress') {
              return { ...s, progress: { done: event.done, total: event.total } }
            }
            if (event.kind === 'end') {
              return { ...s, running: false, truncated: event.truncated, error: event.error }
            }
            return s
          })
        })
      },
      (e: Error) => !cancelled && setState({ ...INITIAL, running: false, error: e.message })
    )

    return () => {
      cancelled = true
      unlisten?.()
      if (id) void window.agentDesk.subscriptions.dispose(id)
    }
  }, [agentPath, requestKey])

  return state
}
