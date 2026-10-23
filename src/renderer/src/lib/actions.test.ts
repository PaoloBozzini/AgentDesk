import { describe, expect, it } from 'vitest'
import type { AgentRuntime, AgentSummary } from '../../../shared/agent-types'
import { availableActions } from './actions'

const agent = (
  runtime?: Partial<AgentRuntime>,
  extra: Partial<AgentSummary> = {}
): AgentSummary => ({
  path: '/x/a.plist',
  fileName: 'a.plist',
  scope: 'user',
  readOnly: false,
  label: 'a',
  labelMismatch: false,
  runtime: runtime && {
    loaded: false,
    running: false,
    enabled: true,
    enabledSource: 'default',
    ...runtime
  },
  ...extra
})

describe('availableActions', () => {
  it('not loaded', () => {
    expect(availableActions(agent({}))).toEqual(['load', 'disable'])
  })

  it('loaded, idle', () => {
    expect(availableActions(agent({ loaded: true }))).toEqual([
      'unload',
      'start',
      'reload',
      'disable'
    ])
  })

  it('running', () => {
    expect(availableActions(agent({ loaded: true, running: true }))).toEqual([
      'unload',
      'restart',
      'reload',
      'disable'
    ])
  })

  it('disabled', () => {
    expect(availableActions(agent({ enabled: false }))).toEqual(['load', 'enable'])
  })

  it('nothing for read-only, label-less or unknown-status agents', () => {
    expect(availableActions(agent({}, { readOnly: true, scope: 'global-daemon' }))).toEqual([])
    expect(availableActions(agent({}, { label: undefined }))).toEqual([])
    expect(availableActions(agent(undefined))).toEqual([])
  })
})
