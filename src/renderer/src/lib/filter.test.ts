import { describe, expect, it } from 'vitest'
import type { AgentRuntime, AgentSummary } from '../../../shared/agent-types'
import { EMPTY_FILTER, filterAgents, matchesStatus, statusCounts } from './filter'

const agent = (
  label: string | undefined,
  runtime?: Partial<AgentRuntime>,
  fileName = `${label}.plist`
): AgentSummary => ({
  path: `/x/${fileName}`,
  fileName,
  scope: 'user',
  readOnly: false,
  label,
  labelMismatch: false,
  runtime: runtime && {
    loaded: false,
    running: false,
    enabled: true,
    enabledSource: 'default',
    ...runtime
  }
})

const running = agent('com.paolo.backup', { loaded: true, running: true, pid: 1 })
const idleOk = agent('com.Google.Updater', { loaded: true, lastExitStatus: 0 })
const failed = agent('com.example.crash', { loaded: true, lastExitStatus: 1 })
const killed = agent('com.example.killed', { loaded: true, lastExitStatus: -9 })
const notLoaded = agent('com.example.off', {})
const unknown = agent(undefined, undefined, 'stub.plist')
const agents = [running, idleOk, failed, killed, notLoaded, unknown]

describe('filterAgents: search', () => {
  it('returns the same array when nothing is filtered', () => {
    expect(filterAgents(agents, EMPTY_FILTER)).toBe(agents)
    expect(filterAgents(agents, { query: '   ', status: 'all' })).toBe(agents)
  })

  it('matches case-insensitive, trimmed substrings', () => {
    expect(filterAgents(agents, { query: ' GOOGLE ', status: 'all' })).toEqual([idleOk])
  })

  it('falls back to the file name when there is no label', () => {
    expect(filterAgents(agents, { query: 'stub', status: 'all' })).toEqual([unknown])
  })
})

describe('matchesStatus', () => {
  it.each([
    ['loaded', [running, idleOk, failed, killed]],
    ['running', [running]],
    ['failed', [failed, killed]],
    ['not-loaded', [notLoaded]]
  ] as const)('%s', (status, expected) => {
    expect(agents.filter((a) => matchesStatus(a, status))).toEqual(expected)
  })
})

describe('filterAgents: combined', () => {
  it('applies search and status together', () => {
    expect(filterAgents(agents, { query: 'example', status: 'failed' })).toEqual([failed, killed])
    expect(filterAgents(agents, { query: 'crash', status: 'running' })).toEqual([])
  })
})

describe('statusCounts', () => {
  it('counts every status for the current search', () => {
    expect(statusCounts(agents, '')).toEqual({
      all: 6,
      loaded: 4,
      running: 1,
      failed: 2,
      'not-loaded': 1
    })
    expect(statusCounts(agents, 'example')).toEqual({
      all: 3,
      loaded: 2,
      running: 0,
      failed: 2,
      'not-loaded': 1
    })
  })
})
