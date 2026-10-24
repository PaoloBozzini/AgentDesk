import { mkdir, mkdtemp, readdir, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExecFn, ExecResult } from './launchctl/runner'
import { appSupportDir, PathRestrictionError, writeRootsFor } from './paths'
import { MAX_PLIST_BYTES } from './plist'
import { lintPlist, PLUTIL, PlutilError } from './plutil'

const VALID = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.example.lint</string>
</dict>
</plist>
`
const INVALID = VALID.replace('</string>', '')

let base: string
let tempDir: string
let roots: string[]

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'agentdesk-plutil-'))
  const home = join(base, 'home')
  roots = writeRootsFor(home)
  tempDir = join(appSupportDir(home), 'tmp')
  await mkdir(join(home, 'Library', 'Application Support'), { recursive: true })
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

const leftovers = async (): Promise<string[]> => readdir(tempDir).catch(() => [])

function fakeExec(result: Partial<ExecResult>, seen: string[][] = []): ExecFn {
  return async (file, args) => {
    seen.push([file, ...args])
    // the temp file must exist while plutil runs
    await stat(args[1])
    return { stdout: '', stderr: '', code: 0, signal: null, timedOut: false, ...result }
  }
}

describe.runIf(process.platform === 'darwin')('lintPlist with the real plutil', () => {
  it('accepts a valid plist', async () => {
    expect(await lintPlist(VALID, { tempDir, roots })).toEqual({ ok: true, message: 'OK' })
    expect(await leftovers()).toEqual([])
  })

  it('reports errors without the temp path', async () => {
    const result = await lintPlist(INVALID, { tempDir, roots })
    expect(result.ok).toBe(false)
    expect(result.message).not.toContain(tempDir)
    expect(result.message).not.toContain('lint-')
    expect(result.message.length).toBeGreaterThan(0)
    expect(await leftovers()).toEqual([])
  })

  it('accepts bytes', async () => {
    expect(await lintPlist(Buffer.from(VALID), { tempDir, roots })).toEqual({
      ok: true,
      message: 'OK'
    })
  })
})

describe('lintPlist', () => {
  it('runs plutil -lint on a private temp file in the temp dir', async () => {
    const seen: string[][] = []
    let mode = 0
    const exec: ExecFn = async (file, args, timeout) => {
      mode = (await stat(args[1])).mode & 0o777
      return fakeExec({ stdout: `${args[1]}: OK\n` }, seen)(file, args, timeout)
    }
    expect(await lintPlist(VALID, { tempDir, roots, exec })).toEqual({ ok: true, message: 'OK' })
    expect(seen[0][0]).toBe(PLUTIL)
    expect(seen[0][1]).toBe('-lint')
    expect(seen[0][2]).toMatch(/\/tmp\/lint-[0-9a-f-]+\.plist$/)
    expect(mode).toBe(0o600)
    expect((await stat(tempDir)).mode & 0o777).toBe(0o700)
    expect(await leftovers()).toEqual([])
  })

  it('maps exit 1 to a lint failure', async () => {
    const exec: ExecFn = async (_f, args) => ({
      stdout: `${args[1]}: Unexpected character at line 3\n`,
      stderr: '',
      code: 1,
      signal: null,
      timedOut: false
    })
    expect(await lintPlist(INVALID, { tempDir, roots, exec })).toEqual({
      ok: false,
      message: 'Unexpected character at line 3'
    })
  })

  it.each<[string, Partial<ExecResult>]>([
    ['timeout', { code: null, signal: 'SIGTERM', timedOut: true }],
    ['missing binary', { code: null, stderr: 'spawn /usr/bin/plutil ENOENT' }],
    ['other exit code', { code: 2 }]
  ])('throws and cleans up on %s', async (_name, result) => {
    await expect(lintPlist(VALID, { tempDir, roots, exec: fakeExec(result) })).rejects.toThrow(
      PlutilError
    )
    expect(await leftovers()).toEqual([])
  })

  it('cleans up when exec itself rejects', async () => {
    const exec: ExecFn = async () => {
      throw new Error('boom')
    }
    await expect(lintPlist(VALID, { tempDir, roots, exec })).rejects.toThrow('boom')
    expect(await leftovers()).toEqual([])
  })

  it('refuses a temp dir outside the write roots', async () => {
    await expect(
      lintPlist(VALID, { tempDir: join(base, 'elsewhere'), roots, exec: fakeExec({}) })
    ).rejects.toThrow(PathRestrictionError)
  })

  it('rejects oversized input without running plutil', async () => {
    const seen: string[][] = []
    const result = await lintPlist('x'.repeat(MAX_PLIST_BYTES + 1), {
      tempDir,
      roots,
      exec: fakeExec({}, seen)
    })
    expect(result).toEqual({ ok: false, message: 'Plist is too large' })
    expect(seen).toEqual([])
  })
})
