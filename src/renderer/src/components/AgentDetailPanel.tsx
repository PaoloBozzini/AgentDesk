import { useEffect, useState } from 'react'
import type { AgentDetail } from '../../../shared/agent-types'
import { PlistTree } from './PlistTree'

type Tab = 'keys' | 'xml'

type Load =
  | { status: 'loading'; path: string }
  | { status: 'ok'; path: string; detail: AgentDetail }
  | { status: 'error'; path: string; message: string }

export function AgentDetailPanel({
  path,
  onClose
}: {
  path: string
  onClose: () => void
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('keys')
  const [load, setLoad] = useState<Load>({ status: 'loading', path })

  useEffect(() => {
    let cancelled = false
    window.agentDesk.agents.read(path).then(
      (detail) => !cancelled && setLoad({ status: 'ok', path, detail }),
      (e: Error) => !cancelled && setLoad({ status: 'error', path, message: e.message })
    )
    return () => {
      cancelled = true
    }
  }, [path])

  // Ignore results that belong to a previously selected agent
  const current: Load = load.path === path ? load : { status: 'loading', path }
  const summary = current.status === 'ok' ? current.detail.summary : undefined

  return (
    <aside className="detail">
      <header className="detail-header">
        <div className="detail-title">
          <h2>{summary?.label ?? path.split('/').pop()}</h2>
          <p className="muted mono" title={path}>
            {path}
          </p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close detail">
          ✕
        </button>
      </header>

      {summary?.readOnly && <p className="notice">System agent: read-only</p>}
      {summary?.format === 'binary' && (
        <p className="notice">Binary plist: XML below is a normalized view of the file.</p>
      )}

      <nav className="tabs" role="tablist">
        {(['keys', 'xml'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'tab active' : 'tab'}
            onClick={() => setTab(t)}
          >
            {t === 'keys' ? 'Keys' : 'Raw XML'}
          </button>
        ))}
      </nav>

      <div className="detail-body">
        {current.status === 'loading' && <p className="state">Loading…</p>}
        {current.status === 'error' && <p className="state error">{current.message}</p>}
        {current.status === 'ok' &&
          (tab === 'keys' ? (
            <PlistTree dict={current.detail.data} />
          ) : (
            <pre className="xml mono">{current.detail.xml}</pre>
          ))}
      </div>
    </aside>
  )
}
