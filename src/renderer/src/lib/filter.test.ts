import { describe, expect, it } from 'vitest'
import type { AgentSummary } from '../../../shared/agent-types'
import { filterAgents } from './filter'

const agent = (label: string | undefined, fileName = `${label}.plist`): AgentSummary => ({
  path: `/x/${fileName}`,
  fileName,
  scope: 'user',
  readOnly: false,
  label,
  labelMismatch: false
})

const agents = [
  agent('com.paolo.backup'),
  agent('com.Google.Updater'),
  agent(undefined, 'stub.plist')
]

describe('filterAgents', () => {
  it('returns everything for an empty or blank query', () => {
    expect(filterAgents(agents, { query: '' })).toBe(agents)
    expect(filterAgents(agents, { query: '   ' })).toBe(agents)
  })

  it('matches case-insensitive substrings', () => {
    expect(filterAgents(agents, { query: 'GOOGLE' }).map((a) => a.label)).toEqual([
      'com.Google.Updater'
    ])
    expect(filterAgents(agents, { query: 'com.' })).toHaveLength(2)
  })

  it('falls back to the file name when there is no label', () => {
    expect(filterAgents(agents, { query: 'stub' })).toHaveLength(1)
  })

  it('trims the query', () => {
    expect(filterAgents(agents, { query: '  backup ' })).toHaveLength(1)
  })
})
