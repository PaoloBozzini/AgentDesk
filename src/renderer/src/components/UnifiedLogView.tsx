import { useLayoutEffect, useRef, useState } from 'react'
import type { LogWindow, UnifiedLogLine } from '../../../shared/log-types'
import { useUnifiedLog, type UnifiedLogRequest } from '../hooks/useUnifiedLog'
import { formatLogTime } from '../lib/format'

const WINDOWS: LogWindow[] = ['15m', '1h', '24h']

function LogRows({ lines }: { lines: UnifiedLogLine[] }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  // Newest entries are at the bottom: follow them unless the user scrolled up
  useLayoutEffect(() => {
    const el = ref.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [lines])

  const onScroll = (): void => {
    const el = ref.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  return (
    <div ref={ref} className="ulog-rows mono" onScroll={onScroll}>
      {lines.map((l, i) => (
        <div key={i} className={`ulog-row level-${l.level.toLowerCase()}`}>
          <span className="ulog-time">{formatLogTime(l.timestamp)}</span>
          <span
            className="ulog-proc"
            title={l.subsystem ? `${l.subsystem} ${l.category ?? ''}` : undefined}
          >
            {l.process}
            {l.pid !== undefined ? `[${l.pid}]` : ''}
          </span>
          <span className="ulog-msg">{l.message}</span>
        </div>
      ))}
    </div>
  )
}

function Results({
  agentPath,
  request
}: {
  agentPath: string
  request: UnifiedLogRequest
}): React.JSX.Element {
  const { lines, running, predicate, note, error, truncated, dropped, progress } = useUnifiedLog(
    agentPath,
    request
  )
  const partial = progress && progress.done > 0 && progress.done < progress.total
  return (
    <>
      {note && <p className="log-note muted">{note}</p>}
      <div className="log-status">
        <span>
          {running
            ? request.kind === 'stream'
              ? `Live: ${lines.length + dropped} entries since start. Waiting for new ones…`
              : partial
                ? `${lines.length} entries so far. Still searching launchd’s messages (can take up to a minute for 24 h)…`
                : `Reading the system log… ${lines.length} entries`
            : error
              ? ''
              : `${lines.length + dropped} entries${truncated ? ' (stopped at the limit)' : ''}${dropped ? `, showing the latest ${lines.length}` : ''}`}
        </span>
      </div>
      {error && <p className="state error">{error}</p>}
      {!running && !error && lines.length === 0 ? (
        <p className="state">
          {request.kind === 'stream' ? 'Stream ended.' : 'No entries in this time window.'}
        </p>
      ) : (
        <LogRows lines={lines} />
      )}
      {predicate && (
        <details className="ulog-query">
          <summary>Query</summary>
          <code>{predicate}</code>
        </details>
      )}
    </>
  )
}

export function UnifiedLogView({ agentPath }: { agentPath: string }): React.JSX.Element {
  const [window, setWindow] = useState<LogWindow>('1h')
  const [nonce, setNonce] = useState(0)
  const [live, setLive] = useState(false)
  const request: UnifiedLogRequest = live ? { kind: 'stream' } : { kind: 'show', window, nonce }
  const key = live ? `${agentPath}:live` : `${agentPath}:${window}:${nonce}`

  return (
    <div className="log-view">
      <div className="ulog-toolbar">
        <div className="segmented" role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              className={!live && w === window ? 'chip active' : 'chip'}
              aria-pressed={!live && w === window}
              onClick={() => {
                setLive(false)
                setWindow(w)
              }}
            >
              Last {w}
            </button>
          ))}
        </div>
        <div className="segmented">
          {!live && (
            <button className="button" onClick={() => setNonce((n) => n + 1)}>
              Refresh
            </button>
          )}
          <button
            className={live ? 'button live active' : 'button live'}
            aria-pressed={live}
            onClick={() => setLive((l) => !l)}
            title={live ? 'Stop the live stream' : 'Stream new entries as they are logged'}
          >
            {live ? '■ Stop live' : '● Live'}
          </button>
        </div>
      </div>
      <Results key={key} agentPath={agentPath} request={request} />
    </div>
  )
}
