import { describe, expect, it, vi } from 'vitest'
import {
  isAlive,
  killAllChildrenNow,
  liveChildCount,
  ProcessRegistry,
  spawnTracked
} from './processes'

const waitFor = async (check: () => boolean, timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}

// A child that ignores SIGTERM, without going through a shell
const STUBBORN = ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)']

describe('ProcessRegistry', () => {
  it('disposes a single subscription', () => {
    const reg = new ProcessRegistry()
    const dispose = vi.fn()
    const id = reg.add(1, dispose)
    expect(reg.size).toBe(1)
    reg.dispose(id)
    reg.dispose(id)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(reg.size).toBe(0)
  })

  it('disposes everything an owner holds, and only that', () => {
    const reg = new ProcessRegistry()
    const a = vi.fn()
    const b = vi.fn()
    const other = vi.fn()
    reg.add(1, a)
    reg.add(1, b)
    reg.add(2, other)
    reg.disposeOwner(1)
    expect(a).toHaveBeenCalled()
    expect(b).toHaveBeenCalled()
    expect(other).not.toHaveBeenCalled()
    expect(reg.size).toBe(1)
  })

  it('disposeAll survives a throwing disposer', () => {
    const reg = new ProcessRegistry()
    const after = vi.fn()
    reg.add(1, () => {
      throw new Error('boom')
    })
    reg.add(2, after)
    expect(() => reg.disposeAll()).not.toThrow()
    expect(after).toHaveBeenCalled()
    expect(reg.size).toBe(0)
  })

  it('ignores unknown ids', () => {
    expect(() => new ProcessRegistry().dispose('nope')).not.toThrow()
  })

  it('lets a subscription remove itself when its process ends on its own', () => {
    const reg = new ProcessRegistry()
    const id = reg.add(1, () => {})
    reg.forget(id)
    expect(reg.size).toBe(0)
  })
})

describe('spawnTracked', () => {
  it('kills the child on dispose', async () => {
    const child = spawnTracked('/bin/sleep', ['30'])
    expect(isAlive(child.pid)).toBe(true)
    await child.kill()
    expect(isAlive(child.pid)).toBe(false)
  })

  it('escalates to SIGKILL when SIGTERM is ignored', async () => {
    const child = spawnTracked(process.execPath, STUBBORN, { killGraceMs: 200 })
    await new Promise((r) => setTimeout(r, 300))
    const t0 = Date.now()
    await child.kill()
    expect(isAlive(child.pid)).toBe(false)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(150)
  })

  it('resolves kill immediately for an already-exited child', async () => {
    const child = spawnTracked('/usr/bin/true', [])
    await waitFor(() => child.exited)
    await expect(child.kill()).resolves.toBeUndefined()
  })

  it('reports exit and passes args literally (no shell)', async () => {
    const out: string[] = []
    const child = spawnTracked('/bin/echo', ['$HOME;id'])
    child.process.stdout?.on('data', (d) => out.push(String(d)))
    await waitFor(() => child.exited)
    expect(out.join('')).toBe('$HOME;id\n')
  })

  it('killAllChildrenNow SIGKILLs every live child synchronously', async () => {
    const a = spawnTracked('/bin/sleep', ['30'])
    const b = spawnTracked(process.execPath, STUBBORN)
    expect(liveChildCount()).toBeGreaterThanOrEqual(2)
    killAllChildrenNow()
    await waitFor(() => !isAlive(a.pid) && !isAlive(b.pid))
    expect(liveChildCount()).toBe(0)
  })

  it('end-to-end: an owner going away kills its processes', async () => {
    const reg = new ProcessRegistry()
    const a = spawnTracked('/bin/sleep', ['30'])
    const b = spawnTracked(process.execPath, STUBBORN, { killGraceMs: 200 })
    reg.add(7, () => void a.kill())
    reg.add(7, () => void b.kill())
    reg.disposeOwner(7)
    await waitFor(() => !isAlive(a.pid) && !isAlive(b.pid))
  })
})
