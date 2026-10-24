import { randomUUID } from 'crypto'
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { LintResult } from '../../shared/plist-types'
import { execFileAsync, type ExecFn } from './launchctl/runner'
import { assertWritablePath } from './paths'
import { MAX_PLIST_BYTES } from './plist'

export const PLUTIL = '/usr/bin/plutil'
const TIMEOUT_MS = 10_000

export class PlutilError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlutilError'
  }
}

export interface LintOptions {
  /** Folder for the temp file (`<app support>/tmp`); created if missing. */
  tempDir: string
  /** Write roots; `tempDir` must be inside one. */
  roots: string[]
  exec?: ExecFn
}

/**
 * `plutil -lint` on in-memory plist text. plutil only lints files, so the text
 * goes to a private temp file that is always removed afterwards.
 *
 * Resolves `{ ok: false, message }` for an invalid plist; rejects only when
 * plutil itself could not run (missing, timed out, killed).
 */
export async function lintPlist(
  content: string | Uint8Array,
  { tempDir, roots, exec = execFileAsync }: LintOptions
): Promise<LintResult> {
  const size = typeof content === 'string' ? Buffer.byteLength(content) : content.byteLength
  if (size > MAX_PLIST_BYTES) return { ok: false, message: 'Plist is too large' }

  const dir = await assertWritablePath(tempDir, roots)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const file = join(dir, `lint-${randomUUID()}.plist`)
  try {
    await writeFile(file, content, { flag: 'wx', mode: 0o600 })
    const result = await exec(PLUTIL, ['-lint', file], TIMEOUT_MS)
    // plutil prefixes every line with "<file>: "; the temp path means nothing to the user
    const message = (result.stdout + result.stderr).split(`${file}: `).join('').trim()
    if (result.code === 0 && !result.timedOut) return { ok: true, message }
    if (result.code === 1) return { ok: false, message: message || 'Invalid plist' }
    const why = result.timedOut
      ? 'timed out'
      : message || `exited with ${result.code ?? result.signal}`
    throw new PlutilError(`plutil -lint failed: ${why}`)
  } finally {
    await rm(file, { force: true })
  }
}
