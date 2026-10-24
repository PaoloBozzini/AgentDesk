import { useEffect, useState } from 'react'
import type { AgentDetail, AgentSummary } from '../../../shared/agent-types'
import { AgentActions } from './AgentActions'
import { EditAgentDialog } from './EditAgentDialog'
import { LogView } from './LogView'
import { UnifiedLogView } from './UnifiedLogView'
import { PlistTree } from './PlistTree'

type Tab = 'keys' | 'xml' | 'stdout' | 'stderr' | 'system'

const TAB_LABELS: Record<Tab, string> = {
  keys: 'Keys',
  xml: 'Raw XML',
  stdout: 'stdout',
  stderr: 'stderr',
  system: 'System log'
}

type Load =
  | { status: 'loading'; path: string }
  | { status: 'ok'; path: string; detail: AgentDetail }
  | { status: 'error'; path: string; message: string }

export function AgentDetailPanel({
  path,
  agent,
  revision,
  onClose,
  onChanged
}: {
  path: string
  /** Latest list entry (with runtime) for this path, if any. */
  agent?: AgentSummary
  /** Re-read the file when this changes (list refreshed). */
  revision: number
  onClose: () => void
  /** An action ran: refresh the list. */
  onChanged: () => void
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('keys')
  const [load, setLoad] = useState<Load>({ status: 'loading', path })
  // Pinned when the editor opens: later re-reads (watcher) must not change its baseline
  const [editing, setEditing] = useState<AgentDetail | null>(null)

  useEffect(() => {
    let cancelled = false
    window.agentDesk.agents.read(path).then(
      (detail) => !cancelled && setLoad({ status: 'ok', path, detail }),
      (e: Error) => !cancelled && setLoad({ status: 'error', path, message: e.message })
    )
    return () => {
      cancelled = true
    }
  }, [path, revision])

  // Ignore results that belong to a previously selected agent
  const current: Load = load.path === path ? load : { status: 'loading', path }
  const summary = current.status === 'ok' ? current.detail.summary : undefined
  const data = current.status === 'ok' ? current.detail.data : undefined
  const tabs: Tab[] = ['keys', 'xml']
  if (typeof data?.StandardOutPath === 'string') tabs.push('stdout')
  if (typeof data?.StandardErrorPath === 'string') tabs.push('stderr')
  if (summary?.label) tabs.push('system')
  const activeTab: Tab = tabs.includes(tab) ? tab : 'keys'

  return (
    <aside className="detail">
      <header className="detail-header">
        <div className="detail-title">
          <h2>{summary?.label ?? path.split('/').pop()}</h2>
          <p className="muted mono" title={path}>
            {path}
          </p>
        </div>
        {current.status === 'ok' && !current.detail.summary.readOnly && (
          <button
            className="button"
            onClick={() => setEditing(current.detail)}
            title="Edit this agent"
          >
            Edit…
          </button>
        )}
        <button className="icon-button" onClick={onClose} aria-label="Close detail">
          ✕
        </button>
      </header>

      {agent && <AgentActions key={agent.path} agent={agent} onDone={onChanged} />}
      {summary?.readOnly && <p className="notice">System agent: read-only</p>}
      {summary?.format === 'binary' && (
        <p className="notice">Binary plist: XML below is a normalized view of the file.</p>
      )}

      <nav className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={activeTab === t}
            className={activeTab === t ? 'tab active' : 'tab'}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      <div className="detail-body">
        {current.status === 'loading' && <p className="state">Loading…</p>}
        {current.status === 'error' && <p className="state error">{current.message}</p>}
        {current.status === 'ok' && activeTab === 'keys' && (
          <PlistTree dict={current.detail.data} />
        )}
        {current.status === 'ok' && activeTab === 'xml' && (
          <pre className="xml mono">{current.detail.xml}</pre>
        )}
        {activeTab === 'system' && <UnifiedLogView key={path} agentPath={path} />}
        {(activeTab === 'stdout' || activeTab === 'stderr') && (
          <LogView key={`${path}:${activeTab}`} agentPath={path} stream={activeTab} />
        )}
      </div>
      {editing && editing.summary.path === path && (
        <EditAgentDialog
          detail={editing}
          loaded={agent?.runtime?.loaded === true}
          onSaved={onChanged}
          onClose={() => setEditing(null)}
        />
      )}
    </aside>
  )
}
