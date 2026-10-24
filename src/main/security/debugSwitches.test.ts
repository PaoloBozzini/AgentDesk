import { describe, expect, it } from 'vitest'
import { debugSwitchesIn } from './debugSwitches'

describe('debugSwitchesIn', () => {
  it('finds debugging switches', () => {
    const present = new Set(['remote-debugging-port', 'inspect-brk', 'lang'])
    expect(debugSwitchesIn((s) => present.has(s))).toEqual(['remote-debugging-port', 'inspect-brk'])
  })

  it('is empty for a normal launch', () => {
    expect(debugSwitchesIn(() => false)).toEqual([])
  })
})
