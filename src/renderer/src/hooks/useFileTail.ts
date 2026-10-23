import { useEffect, useState } from 'react'
import type { FileStatus, LogStream } from '../../../shared/log-types'
import { ensureLogHub, listen } from '../lib/logHub'

/** Keep the view bounded: older text is dropped from the top. */
export const MAX_VIEW_CHARS = 512 * 1024

export function capText(text: string): string {
  return text.length > MAX_VIEW_CHARS ? text.slice(text.length - MAX_VIEW_CHARS) : text
}

export interface FileTailState {
  text: string
  path?: string
  status?: FileStatus
  /** Started mid-file (older content not shown). */
  truncated: boolean
  /** Couldn't start (key not set, relative path, bad agent path). */
  error?: string
}

export function useFileTail(agentPath: string, stream: LogStream): FileTailState {
  const [state, setState] = useState<FileTailState>({ text: '', truncated: false })

  useEffect(() => {
    let cancelled = false
    let id: string | undefined
    let unlisten: (() => void) | undefined
    ensureLogHub()

    window.agentDesk.logs.tailFile(agentPath, stream).then(
      (result) => {
        if (!result.ok) {
          if (!cancelled) setState({ text: '', truncated: false, error: result.message })
          return
        }
        id = result.id
        if (cancelled) {
          void window.agentDesk.subscriptions.dispose(id)
          return
        }
        setState((s) => ({ ...s, path: result.path }))
        unlisten = listen(result.id, (event) => {
          setState((s) => {
            switch (event.kind) {
              case 'reset':
                return { ...s, text: capText(event.text), truncated: event.truncated }
              case 'append':
                return { ...s, text: capText(s.text + event.text) }
              case 'status':
                return { ...s, status: event.status }
              default:
                return s
            }
          })
        })
      },
      (e: Error) => !cancelled && setState({ text: '', truncated: false, error: e.message })
    )

    return () => {
      cancelled = true
      unlisten?.()
      if (id) void window.agentDesk.subscriptions.dispose(id)
    }
  }, [agentPath, stream])

  return state
}
