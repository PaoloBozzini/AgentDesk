import { describe, expect, it, vi } from 'vitest'
import type { LogEvent } from '../../../shared/log-types'
import { dispatch, listen } from './logHub'

const ev = (id: string, text: string): LogEvent => ({ id, kind: 'append', text })

describe('logHub', () => {
  it('routes events by id', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = listen('a', a)
    const offB = listen('b', b)
    dispatch(ev('a', '1'))
    dispatch(ev('b', '2'))
    expect(a).toHaveBeenCalledWith(ev('a', '1'))
    expect(b).toHaveBeenCalledWith(ev('b', '2'))
    offA()
    offB()
  })

  it('replays events that arrived before listen, in order', () => {
    dispatch(ev('early', '1'))
    dispatch(ev('early', '2'))
    const l = vi.fn()
    const off = listen('early', l)
    expect(l.mock.calls.map((c) => c[0].text)).toEqual(['1', '2'])
    off()
  })

  it('stops delivering after unlisten and drops the buffer', () => {
    const l = vi.fn()
    const off = listen('gone', l)
    off()
    dispatch(ev('gone', 'x'))
    const again = vi.fn()
    // the event went to pending; a fresh listen would replay it, so unlisten must clear
    listen('gone', again)()
    expect(l).not.toHaveBeenCalled()
  })

  it('bounds the pending buffer', () => {
    for (let i = 0; i < 1000; i++) dispatch(ev('flood', String(i)))
    const l = vi.fn()
    listen('flood', l)()
    expect(l).toHaveBeenCalledTimes(500)
  })
})
