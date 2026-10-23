import { useEffect, useState } from 'react'
import { AgentDetailPanel } from './components/AgentDetailPanel'
import { AgentTable } from './components/AgentTable'
import { useAgents } from './hooks/useAgents'

function App(): React.JSX.Element {
  const { agents, loading, error } = useAgents()
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSelectedPath(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Agent Desk</h1>
        <span className="muted">{loading ? 'Loading…' : `${agents.length} agents`}</span>
        <span className="spacer" />
      </header>
      <div className="split">
        <main className="content">
          {error ? (
            <p className="state error">{error}</p>
          ) : !loading && agents.length === 0 ? (
            <p className="state">No agents in ~/Library/LaunchAgents</p>
          ) : (
            <AgentTable agents={agents} selectedPath={selectedPath} onSelect={setSelectedPath} />
          )}
        </main>
        {selectedPath && (
          <AgentDetailPanel path={selectedPath} onClose={() => setSelectedPath(null)} />
        )}
      </div>
    </div>
  )
}

export default App
