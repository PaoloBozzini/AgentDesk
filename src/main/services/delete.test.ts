import { chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../shared/control-types'
import { backupsDir, UNLABELED_DIR } from './backup'
import { deleteAgent, type DeleteDeps } from './delete'
import { writeRootsFor } from './paths'
import { serializePlist } from './plist'

let base: string
let home: string
let agentsDir: string
let trashDir: string
let file: string
let calls: string[]
let deps: DeleteDeps & {
  isLoaded: ReturnType<typeof vi.fn>
  unload: ReturnType<typeof vi.fn>
  trash: ReturnType<typeof vi.fn>
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'agentdesk-delete-'))
  home = join(base, 'home')
  agentsDir = join(home, 'Library', 'LaunchAgents')
  trashDir = join(base, 'Trash')
  await mkdir(agentsDir, { recursive: true })
  await mkdir(trashDir)
  await mkdir(join(home, 'Library', 'Application Support'), { recursive: true })
  file = join(agentsDir, 'com.t.del.plist')
  await writeFile(file, serializePlist({ Label: 'com.t.del', Program: '/bin/true' }))
  calls = []
  deps = {
    writableDirs: [{ dir: agentsDir, scope: 'user' }],
    roots: writeRootsFor(home),
    backupDir: backupsDir(home),
    isLoaded: vi.fn(async () => false),
    unload: vi.fn(async (): Promise<ActionResult> => {
      calls.push('unload')
      return { ok: true }
    }),
    // stand-in for shell.trashItem: a move, never an unlink
    trash: vi.fn(async (p: string) => {
      calls.push('trash')
      await rename(p, join(trashDir, 'trashed.plist'))
    })
  }
})

afterEach(async () => {
  await chmod(join(home, 'Library', 'Application Support'), 0o755).catch(() => {})
  await rm(base, { recursive: true, force: true })
})

const exists = (p: string): Promise<boolean> =>
  stat(p).then(
    () => true,
    () => false
  )

describe('deleteAgent', () => {
  it('backs up, then moves the file to the Trash', async () => {
    const original = await readFile(file, 'utf8')
    const result = await deleteAgent(file, deps)
    if (!result.ok) throw new Error(result.error)
    expect(result.unloaded).toBe(false)
    expect(await readFile(result.backupPath, 'utf8')).toBe(original)
    expect(result.backupPath).toContain(join('backups', 'com.t.del'))
    expect(await exists(file)).toBe(false)
    expect(await readFile(join(trashDir, 'trashed.plist'), 'utf8')).toBe(original)
    expect(deps.trash).toHaveBeenCalledWith(file)
    expect(deps.unload).not.toHaveBeenCalled()
  })

  it('boots out a loaded agent first', async () => {
    deps.isLoaded.mockResolvedValue(true)
    const result = await deleteAgent(file, deps)
    expect(result).toMatchObject({ ok: true, unloaded: true })
    expect(deps.isLoaded).toHaveBeenCalledWith('com.t.del')
    expect(deps.unload).toHaveBeenCalledWith(file)
    expect(calls).toEqual(['unload', 'trash'])
  })

  it('deletes nothing when bootout fails', async () => {
    deps.isLoaded.mockResolvedValue(true)
    const error = { summary: 'nope', command: [], exitCode: 5, stdout: '', stderr: '' }
    deps.unload.mockResolvedValueOnce({ ok: false, error })
    const result = await deleteAgent(file, deps)
    expect(result).toEqual({
      ok: false,
      error: 'Unloading failed, so nothing was deleted',
      unloadError: error
    })
    expect(await exists(file)).toBe(true)
    expect(deps.trash).not.toHaveBeenCalled()
  })

  it('deletes nothing when the backup fails', async () => {
    await chmod(join(home, 'Library', 'Application Support'), 0o500)
    const result = await deleteAgent(file, deps)
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('Nothing was deleted')
    })
    expect(await exists(file)).toBe(true)
    expect(deps.trash).not.toHaveBeenCalled()
  })

  it('reports a Trash failure and keeps the file', async () => {
    deps.trash.mockRejectedValueOnce(new Error('Trash unavailable'))
    expect(await deleteAgent(file, deps)).toEqual({ ok: false, error: 'Trash unavailable' })
    expect(await exists(file)).toBe(true)
  })

  it('can delete a malformed plist (backed up as unlabeled, no launchd lookup)', async () => {
    await writeFile(file, '<plist><dict><key>broken')
    const result = await deleteAgent(file, deps)
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.backupPath).toContain(UNLABELED_DIR)
    expect(deps.isLoaded).not.toHaveBeenCalled()
  })

  it('refuses system agents', async () => {
    deps.writableDirs = [{ dir: agentsDir, scope: 'global-daemon' }]
    expect(await deleteAgent(file, deps)).toEqual({
      ok: false,
      error: 'System agents can’t be deleted'
    })
    expect(await exists(file)).toBe(true)
  })

  it.each([
    ['outside the agent folders', () => join(base, 'x.plist')],
    ['relative', () => 'com.t.del.plist'],
    ['traversal', () => join(agentsDir, '..', 'LaunchAgents', '..', 'x.plist')],
    ['not a string', () => 42 as unknown as string]
  ])('refuses a path %s', async (_name, path) => {
    const result = await deleteAgent(path(), deps)
    expect(result.ok).toBe(false)
    expect(deps.trash).not.toHaveBeenCalled()
    expect(await readdir(agentsDir)).toEqual(['com.t.del.plist'])
  })
})
