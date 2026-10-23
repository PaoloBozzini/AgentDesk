import { AgentTable } from './components/AgentTable'
import { useAgents } from './hooks/useAgents'

function App(): React.JSX.Element {
  const { agents, loading, error } = useAgents()

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Agent Desk</h1>
        <span className="muted">{loading ? 'Loading…' : `${agents.length} agents`}</span>
        <span className="spacer" />
      </header>
      <main className="content">
        {error ? (
          <p className="state error">{error}</p>
        ) : !loading && agents.length === 0 ? (
          <p className="state">No agents in ~/Library/LaunchAgents</p>
        ) : (
          <AgentTable agents={agents} />
        )}
      </main>
    </div>
  )
}

export default App
