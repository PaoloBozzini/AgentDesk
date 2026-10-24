import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../shared/control-types'
import { createAgent, type CreateDeps } from './create'

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
import { writeRootsFor } from './paths'
import { parsePlistXml, serializePlist } from './plist'

let base: string
let home: string
let agentsDir: string
let deps: CreateDeps & { lint: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn> }

const DATA = { Label: 'com.t.new', ProgramArguments: ['/bin/echo', 'hi'], RunAtLoad: true }

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'agentdesk-create-'))
  home = join(base, 'home')
  agentsDir = join(home, 'Library', 'LaunchAgents')
  await mkdir(join(home, 'Library', 'Logs'), { recursive: true })
  deps = {
    agentsDir,
    roots: writeRootsFor(home),
    lint: vi.fn(async () => ({ ok: true, message: 'OK' })),
    load: vi.fn(async (): Promise<ActionResult> => ({ ok: true }))
  }
})

afterEach(async () => {
  hooks.beforeLogDirs = undefined
  await rm(base, { recursive: true, force: true })
})

const target = (label = 'com.t.new'): string => join(agentsDir, `${label}.plist`)

describe('createAgent', () => {
  it('writes <Label>.plist from form data (creating LaunchAgents if needed)', async () => {
    const result = await createAgent({ data: DATA }, { load: false }, deps)
    expect(result).toEqual({ ok: true, path: target() })
    const text = await readFile(target(), 'utf8')
    expect(text).toBe(serializePlist(DATA))
    expect(parsePlistXml(text)).toEqual(DATA)
    expect((await stat(target())).mode & 0o777).toBe(0o644)
    expect(deps.lint).toHaveBeenCalledWith(text)
    expect(deps.load).not.toHaveBeenCalled()
    expect(await readdir(agentsDir)).toEqual(['com.t.new.plist'])
  })

  it('writes XML text exactly as typed', async () => {
    const xml = serializePlist(DATA).replace('<dict>', '<dict>\n  <!-- mine -->')
    expect(await createAgent({ xml }, { load: false }, deps)).toMatchObject({ ok: true })
    expect(await readFile(target(), 'utf8')).toBe(xml)
  })

  it('loads when asked', async () => {
    expect(await createAgent({ data: DATA }, { load: true }, deps)).toEqual({
      ok: true,
      path: target()
    })
    expect(deps.load).toHaveBeenCalledWith(target())
  })

  it('keeps the file and reports a load failure', async () => {
    const error = { summary: 'nope', command: [], exitCode: 5, stdout: '', stderr: '' }
    deps.load.mockResolvedValueOnce({ ok: false, error })
    expect(await createAgent({ data: DATA }, { load: true }, deps)).toEqual({
      ok: true,
      path: target(),
      loadError: error
    })
    await stat(target())
  })

  it('only a strict load: true loads', async () => {
    await createAgent({ data: DATA }, { load: 'yes' }, deps)
    expect(deps.load).not.toHaveBeenCalled()
  })

  it('refuses to overwrite an existing file', async () => {
    await mkdir(agentsDir, { recursive: true })
    await writeFile(target(), 'original')
    const result = await createAgent({ data: DATA }, { load: true }, deps)
    expect(result).toEqual({ ok: false, error: 'com.t.new.plist already exists in LaunchAgents' })
    expect(await readFile(target(), 'utf8')).toBe('original')
    expect(deps.load).not.toHaveBeenCalled()
    expect(await readdir(agentsDir)).toEqual(['com.t.new.plist'])
  })

  it('refuses when the name appears between the check and the write', async () => {
    hooks.beforeLogDirs = async () => {
      await mkdir(agentsDir, { recursive: true })
      await writeFile(target(), 'raced')
    }
    const result = await createAgent({ data: DATA }, { load: true }, deps)
    expect(result).toEqual({ ok: false, error: 'com.t.new.plist already exists in LaunchAgents' })
    expect(await readFile(target(), 'utf8')).toBe('raced')
    expect(await readdir(agentsDir)).toEqual(['com.t.new.plist'])
    expect(deps.load).not.toHaveBeenCalled()
  })

  it('returns field errors from the shared validation', async () => {
    const result = await createAgent(
      { data: { Label: 'bad label', Program: 'relative' } },
      { load: false },
      deps
    )
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { label: expect.any(String), program: 'Must be an absolute path' }
    })
    expect(deps.lint).not.toHaveBeenCalled()
  })

  it('requires a valid string Label even if the form would keep it raw', async () => {
    const result = await createAgent({ data: { Label: 42, Program: '/bin/true' } }, {}, deps)
    expect(result).toMatchObject({ ok: false, error: 'Label is missing or invalid' })
  })

  it('stops on lint failure', async () => {
    deps.lint.mockResolvedValueOnce({ ok: false, message: 'Line 3: bad' })
    expect(await createAgent({ data: DATA }, {}, deps)).toEqual({
      ok: false,
      error: 'plutil -lint rejected the plist',
      lint: 'Line 3: bad'
    })
    expect(await readdir(agentsDir).catch(() => [])).toEqual([])
  })

  it('creates the log folder under ~/Library/Logs', async () => {
    const out = join(home, 'Library', 'Logs', 'com.t.new', 'stdout.log')
    await createAgent({ data: { ...DATA, StandardOutPath: out } }, {}, deps)
    expect((await stat(join(home, 'Library', 'Logs', 'com.t.new'))).isDirectory()).toBe(true)
  })

  it('fails without writing when a log folder cannot be created', async () => {
    const result = await createAgent(
      { data: { ...DATA, StandardOutPath: join(base, 'nope', 'o.log') } },
      {},
      deps
    )
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Log folder') })
    expect(await readdir(agentsDir).catch(() => [])).toEqual([])
  })

  it.each([
    ['null', null],
    ['string', 'x'],
    ['no data', {}],
    ['data with null', { data: { Label: 'a', X: null } }],
    ['data with NaN', { data: { Label: 'a', X: NaN } }],
    ['malformed xml', { xml: '<plist><dict><key>a</key>' }],
    ['xml array root', { xml: serializePlist({}).replace('<dict/>', '<array/>') }]
  ])('rejects bad input: %s', async (_name, input) => {
    const result = await createAgent(input, {}, deps)
    expect(result.ok).toBe(false)
    expect(deps.lint).not.toHaveBeenCalled()
  })

  it('returns lint exceptions as errors', async () => {
    deps.lint.mockRejectedValueOnce(new Error('plutil -lint failed: timed out'))
    expect(await createAgent({ data: DATA }, {}, deps)).toEqual({
      ok: false,
      error: 'plutil -lint failed: timed out'
    })
  })
})
