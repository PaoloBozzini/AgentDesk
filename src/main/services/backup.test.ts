import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupAgentFile, BackupError, backupsDir, backupTimestamp, UNLABELED_DIR } from './backup'
import { writeRootsFor } from './paths'
import { MAX_PLIST_BYTES } from './plist'

const NOW = new Date('2026-10-24T14:05:09.123Z')
const STAMP = '2026-10-24T14-05-09.123Z'

let base: string
let home: string
let dir: string
let roots: string[]
let source: string

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'agentdesk-backup-'))
  home = join(base, 'home')
  roots = writeRootsFor(home)
  dir = backupsDir(home)
  await mkdir(join(home, 'Library', 'LaunchAgents'), { recursive: true })
  await mkdir(join(home, 'Library', 'Application Support'), { recursive: true })
  source = join(home, 'Library', 'LaunchAgents', 'com.t.x.plist')
  await writeFile(source, '<plist>original</plist>')
})

afterEach(async () => {
  await chmod(join(home, 'Library', 'Application Support'), 0o755).catch(() => {})
  await rm(base, { recursive: true, force: true })
})

const opts = (): Parameters<typeof backupAgentFile>[2] => ({ dir, roots, now: () => NOW })

describe('backupTimestamp', () => {
  it('is ISO UTC without colons', () => {
    expect(backupTimestamp(NOW)).toBe(STAMP)
    expect(backupTimestamp(NOW)).not.toContain(':')
  })
})

describe('backupAgentFile', () => {
  it('copies to backups/<label>/<timestamp>.plist', async () => {
    const path = await backupAgentFile(source, 'com.t.x', opts())
    expect(path).toBe(
      join(
        home,
        'Library',
        'Application Support',
        'Agent Desk',
        'backups',
        'com.t.x',
        `${STAMP}.plist`
      )
    )
    expect(await readFile(path, 'utf8')).toBe('<plist>original</plist>')
    expect((await stat(join(dir, 'com.t.x'))).mode & 0o777).toBe(0o700)
  })

  it('never overwrites: same timestamp gets a suffix', async () => {
    const a = await backupAgentFile(source, 'com.t.x', opts())
    await writeFile(source, '<plist>second</plist>')
    const b = await backupAgentFile(source, 'com.t.x', opts())
    expect(b).toBe(join(dir, 'com.t.x', `${STAMP}-1.plist`))
    expect(await readFile(a, 'utf8')).toBe('<plist>original</plist>')
    expect(await readFile(b, 'utf8')).toBe('<plist>second</plist>')
  })

  it.each([undefined, '', '../../etc', 'bad label'])(
    'uses %s folder for a missing or invalid label',
    async (label) => {
      const path = await backupAgentFile(source, label, opts())
      expect(path).toBe(join(dir, UNLABELED_DIR, `${STAMP}.plist`))
    }
  )

  it('backs up the target of a symlinked plist', async () => {
    const real = join(base, 'real.plist')
    await writeFile(real, '<plist>linked</plist>')
    const link = join(home, 'Library', 'LaunchAgents', 'link.plist')
    await symlink(real, link)
    const path = await backupAgentFile(link, 'com.t.link', opts())
    expect(await readFile(path, 'utf8')).toBe('<plist>linked</plist>')
  })

  it('fails with BackupError when the source is missing', async () => {
    await expect(backupAgentFile(join(base, 'nope.plist'), 'com.t.x', opts())).rejects.toThrow(
      BackupError
    )
  })

  it('fails for a directory or an oversized file', async () => {
    await expect(backupAgentFile(base, 'com.t.x', opts())).rejects.toThrow(/not a regular file/)
    await writeFile(source, Buffer.alloc(MAX_PLIST_BYTES + 1))
    await expect(backupAgentFile(source, 'com.t.x', opts())).rejects.toThrow(/too large/)
  })

  it('fails when the backups folder is outside the write roots', async () => {
    await expect(
      backupAgentFile(source, 'com.t.x', { ...opts(), dir: join(base, 'elsewhere') })
    ).rejects.toThrow(BackupError)
    await expect(stat(join(base, 'elsewhere'))).rejects.toThrow()
  })

  it.runIf(process.getuid?.() !== 0)('fails when the folder cannot be created', async () => {
    await chmod(join(home, 'Library', 'Application Support'), 0o500)
    await expect(backupAgentFile(source, 'com.t.x', opts())).rejects.toThrow(BackupError)
  })

  it('leaves no partial file on failure', async () => {
    await expect(backupAgentFile(base, 'com.t.x', opts())).rejects.toThrow()
    expect(await readdir(join(dir, 'com.t.x')).catch(() => [])).toEqual([])
  })
})
