import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/ipc-contract'

function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.agentDesk.app.getInfo().then(setInfo)
  }, [])

  return (
    <main className="app">
      <h1>Agent Desk</h1>
      {info && (
        <p className="muted">
          v{info.version} · uid {info.uid}
        </p>
      )}
    </main>
  )
}

export default App
