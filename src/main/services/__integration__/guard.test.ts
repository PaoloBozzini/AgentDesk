import { describe, expect, it, vi } from 'vitest'
import type { ExecFn } from '../launchctl/runner'
import { assertSafe, guardedExec, isTestLabel } from './guard'

const SB = '/tmp/agentdesk-int-abc'

describe('integration guard', () => {
  it('recognises test labels', () => {
    expect(isTestLabel('com.agentdesk.test.x')).toBe(true)
    expect(isTestLabel('com.agentdesk.test.')).toBe(false)
    expect(isTestLabel('com.paolo.rollbar-check.app')).toBe(false)
  })

  it.each([
    [['print', 'gui/501']],
    [['print', 'system']],
    [['print-disabled', 'gui/501']],
    [['print', 'gui/501/com.agentdesk.test.a']],
    [['bootstrap', 'gui/501', `${SB}/com.agentdesk.test.a.plist`]],
    [['bootout', 'gui/501/com.agentdesk.test.a']],
    [['kickstart', '-k', 'gui/501/com.agentdesk.test.a']],
    [['enable', 'gui/501/com.agentdesk.test.a']],
    [['disable', 'gui/501/com.agentdesk.test.a']]
  ])('allows %j', (args) => {
    expect(() => assertSafe(args, SB)).not.toThrow()
  })

  it.each([
    [['bootout', 'gui/501/com.paolo.rollbar-check.app']],
    [['kickstart', '-k', 'gui/501/com.apple.Finder']],
    [['disable', 'system/com.agentdesk.test.a']],
    [['bootstrap', 'gui/501', '/Users/x/Library/LaunchAgents/com.agentdesk.test.a.plist']],
    [['bootstrap', 'gui/501', `${SB}/com.paolo.real.plist`]],
    [['bootstrap', 'gui/501', `${SB}/../com.agentdesk.test.a.plist`]],
    [['bootout', 'gui/501']],
    [['bootstrap', 'system', `${SB}/com.agentdesk.test.a.plist`]]
  ])('blocks %j', (args) => {
    expect(() => assertSafe(args, SB)).toThrow(/Integration guard blocked/)
  })

  it('never calls the real exec for a blocked command', async () => {
    const real = vi.fn<ExecFn>()
    expect(() =>
      guardedExec(real, SB)('/bin/launchctl', ['bootout', 'gui/501/com.x.y'], 1000)
    ).toThrow()
    expect(real).not.toHaveBeenCalled()
  })
})
