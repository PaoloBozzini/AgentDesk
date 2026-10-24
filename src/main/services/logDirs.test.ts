import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureLogDirs } from './logDirs'
import { PathRestrictionError, writeRootsFor } from './paths'

let base: string
let home: string
let roots: string[]

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'agentdesk-logdirs-'))
  home = join(base, 'home')
  roots = writeRootsFor(home)
  await mkdir(join(home, 'Library', 'Logs'), { recursive: true })
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

const isDir = async (p: string): Promise<boolean> => (await stat(p)).isDirectory()

describe('ensureLogDirs', () => {
  it('creates the label folder under ~/Library/Logs once for stdout and stderr', async () => {
    const dir = join(home, 'Library', 'Logs', 'com.t.x')
    const created = await ensureLogDirs([join(dir, 'stdout.log'), join(dir, 'stderr.log')], roots)
    expect(created).toEqual([dir])
    expect(await isDir(dir)).toBe(true)
  })

  it('creates nested folders', async () => {
    const dir = join(home, 'Library', 'Logs', 'a', 'b')
    await ensureLogDirs([join(dir, 'out.log')], roots)
    expect(await isDir(dir)).toBe(true)
  })

  it('skips blank paths and existing folders anywhere', async () => {
    const outside = join(base, 'outside')
    await mkdir(outside)
    expect(await ensureLogDirs([undefined, '', join(outside, 'o.log')], roots)).toEqual([])
  })

  it('refuses to create a missing folder outside the roots', async () => {
    const missing = join(base, 'nope', 'deeper')
    await expect(ensureLogDirs([join(missing, 'o.log')], roots)).rejects.toThrow(
      PathRestrictionError
    )
    await expect(stat(join(base, 'nope'))).rejects.toThrow()
  })

  it('refuses a symlink inside Logs that points outside', async () => {
    const outside = join(base, 'outside')
    await mkdir(outside)
    await symlink(outside, join(home, 'Library', 'Logs', 'link'))
    await expect(
      ensureLogDirs([join(home, 'Library', 'Logs', 'link', 'new', 'o.log')], roots)
    ).rejects.toThrow(PathRestrictionError)
    await expect(stat(join(outside, 'new'))).rejects.toThrow()
  })

  it('fails when a file sits where the folder should be', async () => {
    const file = join(home, 'Library', 'Logs', 'taken')
    await writeFile(file, '')
    await expect(ensureLogDirs([join(file, 'o.log')], roots)).rejects.toThrow()
  })
})
