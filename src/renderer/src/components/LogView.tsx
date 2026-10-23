import { useLayoutEffect, useRef } from 'react'
import type { FileStatus, LogStream } from '../../../shared/log-types'
import { useFileTail } from '../hooks/useFileTail'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function statusText(status: FileStatus | undefined): string {
  switch (status?.state) {
    case 'ok':
      return formatBytes(status.size)
    case 'missing':
      return 'File doesn’t exist yet. Waiting for the agent to write to it.'
    case 'unreadable':
      return `Can’t read this file: ${status.message}`
    case 'not-a-file':
      return 'This path is not a regular file.'
    default:
      return 'Opening…'
  }
}

/** Live tail of stdout or stderr. Mount with a `key` per agent+stream. */
export function LogView({
  agentPath,
  stream
}: {
  agentPath: string
  stream: LogStream
}): React.JSX.Element {
  const { text, path, status, truncated, error } = useFileTail(agentPath, stream)
  const ref = useRef<HTMLPreElement>(null)
  const stick = useRef(true)

  // Follow new output only while the user is at the bottom
  useLayoutEffect(() => {
    const el = ref.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [text])

  const onScroll = (): void => {
    const el = ref.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  if (error) return <p className="state">{error}</p>

  const problem = status && status.state !== 'ok'
  return (
    <div className="log-view">
      <div className={problem ? 'log-status warn' : 'log-status'}>
        <span className="mono log-path" title={path}>
          {path}
        </span>
        <span className={status?.state === 'ok' ? 'log-size' : undefined}>
          {statusText(status)}
        </span>
      </div>
      {truncated && <p className="log-note muted">Showing the end of the file.</p>}
      <pre ref={ref} className="log-text mono" onScroll={onScroll}>
        {text || (status?.state === 'ok' ? <span className="muted">(empty)</span> : null)}
      </pre>
    </div>
  )
}
