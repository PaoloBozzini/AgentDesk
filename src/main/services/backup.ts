import { constants } from 'fs'
import { copyFile, mkdir, rm, stat } from 'fs/promises'
import { join } from 'path'
import { isValidLabel } from '../../shared/label'
import { appSupportDir, assertWritablePath } from './paths'
import { MAX_PLIST_BYTES } from './plist'

/** Folder for plists without a usable Label; `_` can't start a valid label. */
export const UNLABELED_DIR = '_unlabeled'
const MAX_SAME_TIMESTAMP = 100

export class BackupError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'BackupError'
  }
}

export function backupsDir(home: string): string {
  return join(appSupportDir(home), 'backups')
}

/** ISO-8601 UTC with `-` instead of `:` (Finder shows `:` as `/`). */
export function backupTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, '-')
}

export interface BackupOptions {
  /** `backupsDir(home)`. */
  dir: string
  /** Write roots; `dir` must be inside one. */
  roots: string[]
  now?: () => Date
}

/**
 * Copies `sourcePath` to `<dir>/<label>/<timestamp>.plist` before an edit or
 * delete. Never overwrites an existing backup. Any failure is a BackupError,
 * and callers must not go on with the edit/delete when it throws.
 *
 * Returns the backup's path.
 */
export async function backupAgentFile(
  sourcePath: string,
  label: string | undefined,
  { dir, roots, now = () => new Date() }: BackupOptions
): Promise<string> {
  try {
    const info = await stat(sourcePath)
    if (!info.isFile()) throw new Error('not a regular file')
    if (info.size > MAX_PLIST_BYTES) throw new Error('file is too large')

    const folder = join(dir, label && isValidLabel(label) ? label : UNLABELED_DIR)
    await assertWritablePath(folder, roots)
    await mkdir(folder, { recursive: true, mode: 0o700 })

    const stamp = backupTimestamp(now())
    for (let n = 0; n < MAX_SAME_TIMESTAMP; n++) {
      const target = join(folder, `${stamp}${n ? `-${n}` : ''}.plist`)
      try {
        await copyFile(sourcePath, target, constants.COPYFILE_EXCL)
        return target
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue
        await rm(target, { force: true }).catch(() => {})
        throw e
      }
    }
    throw new Error('too many backups with the same timestamp')
  } catch (e) {
    throw new BackupError(`Backup of ${sourcePath} failed: ${(e as Error).message}`, { cause: e })
  }
}

/**
 * Creates the backups folder if missing (inside the write roots) and opens it
 * with `open` (Electron `shell.openPath`, which resolves to an error message or '').
 */
export async function revealBackups(
  dir: string,
  roots: string[],
  open: (path: string) => Promise<string>
): Promise<void> {
  const real = await assertWritablePath(dir, roots)
  await mkdir(real, { recursive: true, mode: 0o700 })
  const error = await open(real)
  if (error) throw new Error(`Couldn’t open the backups folder: ${error}`)
}
