import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FolderWatcher } from './watcher'

let base: string
let watcher: FolderWatcher | undefined

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'agentdesk-watch-'))
})

afterEach(async () => {
  watcher?.stop()
  await rm(base, { recursive: true, force: true })
})

describe('FolderWatcher', () => {
  it('fires once for a burst of changes', async () => {
    const onChange = vi.fn()
    watcher = new FolderWatcher(base, onChange, { debounceMs: 100 })
    watcher.start()
    await writeFile(join(base, 'a.plist'), '1')
    await writeFile(join(base, 'b.plist'), '2')
    await writeFile(join(base, 'a.plist'), '3')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 })
    await new Promise((r) => setTimeout(r, 300))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does not fire after stop', async () => {
    const onChange = vi.fn()
    watcher = new FolderWatcher(base, onChange, { debounceMs: 50 })
    watcher.start()
    watcher.stop()
    await writeFile(join(base, 'a.plist'), '1')
    await new Promise((r) => setTimeout(r, 300))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('waits for a missing folder and starts watching when it appears', async () => {
    const dir = join(base, 'LaunchAgents')
    const onChange = vi.fn()
    watcher = new FolderWatcher(dir, onChange, { debounceMs: 20, pollMs: 50 })
    watcher.start()
    expect(watcher.isWatching).toBe(false)
    await mkdir(dir)
    await vi.waitFor(() => expect(watcher!.isWatching).toBe(true), { timeout: 2000 })
    onChange.mockClear()
    await writeFile(join(dir, 'x.plist'), '1')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 })
  })

  it('recovers when the folder is deleted and recreated', async () => {
    const dir = join(base, 'LaunchAgents')
    await mkdir(dir)
    const onChange = vi.fn()
    watcher = new FolderWatcher(dir, onChange, { debounceMs: 20, pollMs: 50 })
    watcher.start()
    await rm(dir, { recursive: true })
    await vi.waitFor(() => expect(watcher!.isWatching).toBe(false), { timeout: 2000 })
    await mkdir(dir)
    await vi.waitFor(() => expect(watcher!.isWatching).toBe(true), { timeout: 2000 })
    onChange.mockClear()
    await writeFile(join(dir, 'x.plist'), '1')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 })
  })
})
