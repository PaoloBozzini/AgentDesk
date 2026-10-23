import { useEffect, useState } from 'react'
import { AgentDetailPanel } from './components/AgentDetailPanel'
import { AgentTable } from './components/AgentTable'
import { useAgents } from './hooks/useAgents'

function App(): React.JSX.Element {
  const [includeSystem, setIncludeSystem] = useState(false)
  const { agents, loading, error, revision, reload } = useAgents(includeSystem)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSelectedPath(null)
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
        <span className="muted">{loading ? 'Loading…' : `${agents.length} agents`}</span>
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
          ) : (
            <AgentTable agents={agents} selectedPath={selectedPath} onSelect={setSelectedPath} />
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
