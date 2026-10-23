import { useEffect, useMemo, useRef, useState } from 'react'
import { AgentDetailPanel } from './components/AgentDetailPanel'
import { AgentTable } from './components/AgentTable'
import { useAgents } from './hooks/useAgents'
import { EMPTY_FILTER, filterAgents, type AgentFilter } from './lib/filter'

function App(): React.JSX.Element {
  const [includeSystem, setIncludeSystem] = useState(false)
  const { agents, loading, error, revision, reload } = useAgents(includeSystem)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [filter, setFilter] = useState<AgentFilter>(EMPTY_FILTER)
  const searchRef = useRef<HTMLInputElement>(null)
  const visible = useMemo(() => filterAgents(agents, filter), [agents, filter])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
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
  }, [reload])

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
      <div className="split">
        <main className="content">
          {error ? (
            <p className="state error">{error}</p>
          ) : !loading && agents.length === 0 ? (
            <p className="state">No agents found</p>
          ) : !loading && visible.length === 0 ? (
            <p className="state">No agents match “{filter.query.trim()}”</p>
          ) : (
            <AgentTable agents={visible} selectedPath={selectedPath} onSelect={setSelectedPath} />
          )}
        </main>
        {selectedPath && (
          <AgentDetailPanel
            path={selectedPath}
            revision={revision}
            onClose={() => setSelectedPath(null)}
          />
        )}
      </div>
    </div>
  )
}

export default App
