import { useEffect, useMemo, useRef, useState } from 'react'
import { AgentDetailPanel } from './components/AgentDetailPanel'
import { AgentTable } from './components/AgentTable'
import { CreateAgentDialog } from './components/CreateAgentDialog'
import type { AppInfo } from '../../shared/ipc-contract'
import { useAgents } from './hooks/useAgents'
import {
  EMPTY_FILTER,
  filterAgents,
  STATUS_FILTER_LABELS,
  STATUS_FILTERS,
  statusCounts,
  type AgentFilter
} from './lib/filter'

function App(): React.JSX.Element {
  const [includeSystem, setIncludeSystem] = useState(false)
  const { agents, loading, error, statusError, revision, reload } = useAgents(includeSystem)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [filter, setFilter] = useState<AgentFilter>(EMPTY_FILTER)
  const [creating, setCreating] = useState(false)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const visible = useMemo(() => filterAgents(agents, filter), [agents, filter])
  const counts = useMemo(() => statusCounts(agents, filter.query), [agents, filter.query])

  useEffect(() => {
    window.agentDesk.app.getInfo().then(setInfo, () => setInfo(null))
  }, [])

  useEffect(() => {
    if (creating) return
    const onKey = (e: KeyboardEvent): void => {
      // Dialogs (create / edit) own the keyboard while open
      if (document.querySelector('.modal')) return
      if (e.key === 'n' && e.metaKey) {
        e.preventDefault()
        setCreating(true)
        return
      }
      if (e.key === 'f' && e.metaKey) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (e.key === 'Escape') {
        if (document.activeElement === searchRef.current && searchRef.current?.value) {
          setFilter((f) => ({ ...f, query: '' }))
        } else {
          setSelectedPath(null)
        }
      }
      if (e.key === 'r' && e.metaKey) {
        e.preventDefault()
        reload()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reload, creating])

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Agent Desk</h1>
        <span className="muted">
          {loading
            ? 'Loading…'
            : visible.length === agents.length
              ? `${agents.length} agents`
              : `${visible.length} of ${agents.length}`}
        </span>
        <input
          ref={searchRef}
          className="search"
          type="search"
          placeholder="Search labels  ⌘F"
          aria-label="Search by label"
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
        />
        <span className="spacer" />
        <button
          className="button primary"
          onClick={() => setCreating(true)}
          disabled={!info}
          title="New agent (⌘N)"
        >
          New agent
        </button>
        <button
          className="button"
          onClick={() => void window.agentDesk.app.revealBackups().catch(() => {})}
          title="Open the backups folder in Finder"
        >
          Backups
        </button>
        <button className="button" onClick={reload} disabled={loading} title="Refresh (⌘R)">
          Refresh
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={includeSystem}
            onChange={(e) => setIncludeSystem(e.target.checked)}
          />
          Show system agents (read-only)
        </label>
      </header>
      <nav className="filters" aria-label="Filter by status">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={filter.status === s ? 'chip active' : 'chip'}
            aria-pressed={filter.status === s}
            onClick={() => setFilter((f) => ({ ...f, status: s }))}
          >
            {STATUS_FILTER_LABELS[s]} <span className="chip-count">{counts[s]}</span>
          </button>
        ))}
      </nav>
      {statusError && (
        <p className="banner" title={statusError}>
          Couldn’t read launchd status: {statusError}
        </p>
      )}
      <div className="split">
        <main className="content">
          {error ? (
            <p className="state error">{error}</p>
          ) : !loading && agents.length === 0 ? (
            <p className="state">No agents found</p>
          ) : !loading && visible.length === 0 ? (
            <p className="state">No agents match the current filters</p>
          ) : (
            <AgentTable agents={visible} selectedPath={selectedPath} onSelect={setSelectedPath} />
          )}
        </main>
        {selectedPath && (
          <AgentDetailPanel
            path={selectedPath}
            agent={agents.find((a) => a.path === selectedPath)}
            revision={revision}
            onChanged={reload}
            onClose={() => setSelectedPath(null)}
          />
        )}
      </div>
      {creating && info && (
        <CreateAgentDialog
          info={info}
          onCreated={(path) => {
            setFilter(EMPTY_FILTER)
            setSelectedPath(path)
            reload()
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}

export default App
