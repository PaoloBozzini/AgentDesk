import { useEffect, useRef } from 'react'
import type { AgentSummary } from '../../../shared/agent-types'
import { formatExit, isFailed, programLine } from '../lib/format'

const PLACEHOLDER = '—'

function AgentRow({
  agent,
  selected,
  onSelect
}: {
  agent: AgentSummary
  selected: boolean
  onSelect: (path: string) => void
}): React.JSX.Element {
  const rt = agent.runtime
  const ref = useRef<HTMLTableRowElement>(null)
  // Keep the selected row visible during keyboard navigation
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  return (
    <tr
      ref={ref}
      title={agent.path}
      className={selected ? 'selected' : undefined}
      aria-selected={selected}
      onClick={() => onSelect(agent.path)}
    >
      <td className="col-label">
        <span className="agent-label">{agent.label ?? agent.fileName}</span>
        {agent.readOnly && (
          <span className="badge muted-badge" title="System agent, read-only">
            {agent.scope === 'global-daemon' ? 'daemon' : 'system'}
          </span>
        )}
        {agent.error && <span className="badge danger">unreadable</span>}
        {rt && !rt.enabled && (
          <span
            className="badge muted-badge"
            title={
              rt.enabledSource === 'override' ? 'Disabled via launchctl' : 'Disabled key in plist'
            }
          >
            disabled
          </span>
        )}
        {!agent.error && !agent.label && <span className="badge warn">no Label</span>}
        {agent.labelMismatch && (
          <span className="badge warn" title={`File name ${agent.fileName} ≠ ${agent.label}.plist`}>
            name ≠ label
          </span>
        )}
      </td>
      <td className="col-program mono" title={agent.error ?? programLine(agent)}>
        {agent.error ?? programLine(agent)}
      </td>
      <td className="col-status">
        {rt?.loaded ? 'yes' : <span className="muted">{rt ? 'no' : PLACEHOLDER}</span>}
      </td>
      <td className="col-status">
        {rt?.running ? (
          <span className="running">● running</span>
        ) : (
          <span className="muted">{rt ? '—' : PLACEHOLDER}</span>
        )}
      </td>
      <td className="col-status mono">{rt?.pid ?? ''}</td>
      <td className={isFailed(rt) ? 'col-status mono failed' : 'col-status mono'}>
        {formatExit(rt)}
      </td>
    </tr>
  )
}

export function AgentTable({
  agents,
  selectedPath,
  onSelect,
  compact = false
}: {
  agents: AgentSummary[]
  selectedPath: string | null
  onSelect: (path: string) => void
  /** Detail panel open: drop the Program column so status columns keep their width. */
  compact?: boolean
}): React.JSX.Element {
  return (
    <table className={compact ? 'agent-table compact' : 'agent-table'}>
      <thead>
        <tr>
          <th className="col-label">Label</th>
          <th className="col-program">Program</th>
          <th className="col-status">Loaded</th>
          <th className="col-status">Running</th>
          <th className="col-status">PID</th>
          <th className="col-status">Exit</th>
        </tr>
      </thead>
      <tbody>
        {agents.map((a) => (
          <AgentRow key={a.path} agent={a} selected={a.path === selectedPath} onSelect={onSelect} />
        ))}
      </tbody>
    </table>
  )
}
