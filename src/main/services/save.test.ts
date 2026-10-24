import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contentHash, readAgent } from './agents'
import { backupsDir } from './backup'
import { writeRootsFor } from './paths'
import { parsePlistXml, serializePlist } from './plist'
import { saveAgent, type SaveDeps } from './save'

const hooks = vi.hoisted(() => ({ beforeLogDirs: undefined as undefined | (() => Promise<void>) }))
vi.mock('./logDirs', async (importOriginal) => {
  const real = await importOriginal<typeof import('./logDirs')>()
  return {
    ensureLogDirs: async (...args: Parameters<typeof real.ensureLogDirs>) => {
      await hooks.beforeLogDirs?.()
      return real.ensureLogDirs(...args)
    }
  }
})

const ORIGINAL = { Label: 'com.t.edit', Program: '/bin/echo', RunAtLoad: true, Custom: 1 }
const EDITED = { ...ORIGINAL, RunAtLoad: false }

let base: string
let home: string
let agentsDir: string
let file: string
let deps: SaveDeps & { lint: ReturnType<typeof vi.fn> }

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'agentdesk-save-'))
  home = join(base, 'home')
  agentsDir = join(home, 'Library', 'LaunchAgents')
  await mkdir(agentsDir, { recursive: true })
  await mkdir(join(home, 'Library', 'Application Support'), { recursive: true })
  await mkdir(join(home, 'Library', 'Logs'), { recursive: true })
  file = join(agentsDir, 'com.t.edit.plist')
  await writeFile(file, serializePlist(ORIGINAL), { mode: 0o640 })
  await chmod(file, 0o640)
  deps = {
    writableDirs: [{ dir: agentsDir, scope: 'user' }],
    roots: writeRootsFor(home),
    backupDir: backupsDir(home),
    lint: vi.fn(async () => ({ ok: true, message: 'OK' }))
  }
})

afterEach(async () => {
  hooks.beforeLogDirs = undefined
  await chmod(join(home, 'Library', 'Application Support'), 0o755).catch(() => {})
  await rm(base, { recursive: true, force: true })
})

const hash = async (): Promise<string> => contentHash(await readFile(file))
const backups = async (): Promise<string[]> =>
  readdir(join(backupsDir(home), 'com.t.edit')).catch(() => [])

describe('saveAgent', () => {
  it('backs up, then replaces the file keeping its mode', async () => {
    const before = await readFile(file, 'utf8')
    const result = await saveAgent(file, { data: EDITED }, { baseHash: await hash() }, deps)
    if (!result.ok) throw new Error(result.error)
    expect(parsePlistXml(await readFile(file, 'utf8'))).toEqual(EDITED)
    expect(await readFile(result.backupPath, 'utf8')).toBe(before)
    expect((await stat(file)).mode & 0o777).toBe(0o640)
    expect(await readdir(agentsDir)).toEqual(['com.t.edit.plist'])
    expect(deps.lint).toHaveBeenCalledWith(serializePlist(EDITED))
  })

  it('writes XML mode text as typed', async () => {
    const xml = serializePlist(EDITED).replace('<dict>', '<dict>\n  <!-- note -->')
    expect(await saveAgent(file, { xml }, { baseHash: await hash() }, deps)).toMatchObject({
      ok: true
    })
    expect(await readFile(file, 'utf8')).toBe(xml)
  })

  it('converts a binary plist to XML', async () => {
    const { execFileSync } = await import('child_process')
    if (process.platform !== 'darwin') return
    execFileSync('/usr/bin/plutil', ['-convert', 'binary1', file])
    expect((await readAgent(file, deps.writableDirs)).summary.format).toBe('binary')
    const result = await saveAgent(file, { data: EDITED }, { baseHash: await hash() }, deps)
    expect(result.ok).toBe(true)
    const after = await readAgent(file, deps.writableDirs)
    expect(after.summary.format).toBe('xml')
    expect(after.data).toEqual(EDITED)
  })

  it('refuses when the file changed since it was opened', async () => {
    const baseHash = await hash()
    await writeFile(file, serializePlist({ ...ORIGINAL, Custom: 2 }))
    const result = await saveAgent(file, { data: EDITED }, { baseHash }, deps)
    expect(result).toMatchObject({ ok: false, conflict: true })
    expect(parsePlistXml(await readFile(file, 'utf8')).Custom).toBe(2)
    expect(await backups()).toEqual([])
  })

  it('refuses when the file changes during the save (after the backup)', async () => {
    const baseHash = await hash()
    hooks.beforeLogDirs = async () => {
      await writeFile(file, serializePlist({ ...ORIGINAL, Custom: 3 }))
    }
    const result = await saveAgent(file, { data: EDITED }, { baseHash }, deps)
    expect(result).toMatchObject({ ok: false, conflict: true })
    expect(parsePlistXml(await readFile(file, 'utf8')).Custom).toBe(3)
  })

  it.each([undefined, {}, { baseHash: 1 }])('requires a baseHash (%j)', async (options) => {
    expect(await saveAgent(file, { data: EDITED }, options, deps)).toMatchObject({
      ok: false,
      conflict: true
    })
  })

  it('aborts without writing when the backup fails', async () => {
    await chmod(join(home, 'Library', 'Application Support'), 0o500)
    const before = await readFile(file, 'utf8')
    const result = await saveAgent(file, { data: EDITED }, { baseHash: await hash() }, deps)
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Nothing was saved') })
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('refuses a Label change', async () => {
    const result = await saveAgent(
      file,
      { data: { ...EDITED, Label: 'com.t.other' } },
      { baseHash: await hash() },
      deps
    )
    expect(result).toMatchObject({ ok: false, fieldErrors: { label: expect.any(String) } })
  })

  it('stops on lint failure before backing up', async () => {
    deps.lint.mockResolvedValueOnce({ ok: false, message: 'bad' })
    expect(await saveAgent(file, { data: EDITED }, { baseHash: await hash() }, deps)).toMatchObject(
      {
        ok: false,
        lint: 'bad'
      }
    )
    expect(await backups()).toEqual([])
  })

  it('returns field errors', async () => {
    const result = await saveAgent(
      file,
      { data: { ...EDITED, Program: 'relative' } },
      { baseHash: await hash() },
      deps
    )
    expect(result).toMatchObject({ ok: false, fieldErrors: { program: expect.any(String) } })
  })

  it('refuses a symlinked plist', async () => {
    const real = join(agentsDir, 'real.plist')
    await writeFile(real, serializePlist(ORIGINAL))
    await rm(file)
    await symlink(real, file)
    const result = await saveAgent(file, { data: EDITED }, { baseHash: await hash() }, deps)
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('symlink') })
  })

  it('refuses files outside the user folder', async () => {
    const other = join(base, 'x.plist')
    await writeFile(other, serializePlist(ORIGINAL))
    expect(await saveAgent(other, { data: EDITED }, { baseHash: 'x' }, deps)).toMatchObject({
      ok: false,
      error: expect.stringContaining('can’t be edited')
    })
  })

  it('refuses read-only (system) folders', async () => {
    deps.writableDirs = [{ dir: agentsDir, scope: 'global-agent' }]
    expect(await saveAgent(file, { data: EDITED }, { baseHash: await hash() }, deps)).toMatchObject(
      { ok: false, error: 'System agents are read-only' }
    )
  })
})

describe('saveAgent keeps <real> (#42)', () => {
  it('a form-mode save of an unchanged real key keeps <real>2.0</real>', async () => {
    const xml = serializePlist(ORIGINAL).replace(
      '</dict>',
      '\t<key>ExitTimeOut</key>\n\t<real>2.0</real>\n</dict>'
    )
    await writeFile(file, xml)
    const detail = await readAgent(file, deps.writableDirs)
    expect(detail.realHints).toEqual([{ path: ['ExitTimeOut'], text: '2.0' }])
    const edited = { ...detail.data, RunAtLoad: false }
    const result = await saveAgent(
      file,
      { data: edited, realHints: detail.realHints },
      { baseHash: detail.hash },
      deps
    )
    expect(result.ok).toBe(true)
    const saved = await readFile(file, 'utf8')
    expect(saved).toContain('<real>2.0</real>')
    expect(saved).toBe(xml.replace('<true/>', '<false/>'))
  })
})
