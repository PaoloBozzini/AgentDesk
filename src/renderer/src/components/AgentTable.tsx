import type { AgentSummary } from '../../../shared/agent-types'
import { programLine } from '../lib/format'

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
  return (
    <tr
      title={agent.path}
      className={selected ? 'selected' : undefined}
      aria-selected={selected}
      onClick={() => onSelect(agent.path)}
    >
      <td className="col-label">
        <span className="agent-label">{agent.label ?? agent.fileName}</span>
        {agent.error && <span className="badge danger">unreadable</span>}
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
      {/* Status columns are filled in M2 (#14) */}
      <td className="col-status muted">{PLACEHOLDER}</td>
      <td className="col-status muted">{PLACEHOLDER}</td>
      <td className="col-status muted">{PLACEHOLDER}</td>
      <td className="col-status muted">{PLACEHOLDER}</td>
    </tr>
  )
}

export function AgentTable({
  agents,
  selectedPath,
  onSelect
}: {
  agents: AgentSummary[]
  selectedPath: string | null
  onSelect: (path: string) => void
}): React.JSX.Element {
  return (
    <table className="agent-table">
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
