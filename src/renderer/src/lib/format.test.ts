import { describe, expect, it } from 'vitest'
import type { AgentRuntime } from '../../../shared/agent-types'
import { formatExit, isFailed, signalName } from './format'

const rt = (extra: Partial<AgentRuntime>): AgentRuntime => ({
  loaded: true,
  running: false,
  enabled: true,
  enabledSource: 'default',
  ...extra
})

describe('formatExit', () => {
  it.each([
    [undefined, ''],
    [rt({ loaded: false }), ''],
    [rt({ statusText: '-' }), ''],
    [rt({ lastExitStatus: 0, statusText: '0' }), '0'],
    [rt({ lastExitStatus: 78, statusText: '78' }), '78'],
    [rt({ lastExitStatus: -9, statusText: '-9' }), 'SIGKILL'],
    [rt({ lastExitStatus: -99, statusText: '-99' }), 'signal 99'],
    [rt({ statusText: '(pe)' }), '(pe)']
  ])('%j -> %s', (runtime, expected) => {
    expect(formatExit(runtime)).toBe(expected)
  })
})

describe('isFailed', () => {
  it('is true only for loaded agents with a non-zero last status', () => {
    expect(isFailed(rt({ lastExitStatus: 1 }))).toBe(true)
    expect(isFailed(rt({ lastExitStatus: -9 }))).toBe(true)
    expect(isFailed(rt({ lastExitStatus: 0 }))).toBe(false)
    expect(isFailed(rt({ statusText: '-' }))).toBe(false)
    expect(isFailed(rt({ loaded: false, lastExitStatus: 1 }))).toBe(false)
    expect(isFailed(undefined)).toBe(false)
  })
})

describe('signalName', () => {
  it('names common signals', () => {
    expect(signalName(15)).toBe('SIGTERM')
  })
})
