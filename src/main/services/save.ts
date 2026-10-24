import { randomUUID } from 'crypto'
import { chmod, lstat, readFile, rename, rm, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import type { SaveAgentResult } from '../../shared/edit-types'
import type { LintResult } from '../../shared/plist-types'
import { contentHash, readAgent, type AgentDir } from './agents'
import { backupAgentFile, BackupError } from './backup'
import { checkAgentData, EditFailure, failWith, readPlistInput } from './create'
import { ensureLogDirs } from './logDirs'
import { assertWritablePath } from './paths'

export interface SaveDeps {
  /** Only user folders: system agents are read-only. */
  writableDirs: AgentDir[]
  roots: string[]
  /** `backupsDir(home)` */
  backupDir: string
  lint: (xml: string) => Promise<LintResult>
}

/**
 * Saves an edited agent over its file:
 * conflict check → validate → lint → log folders → backup → atomic replace.
 * Nothing is written unless every earlier step passed; a failed backup stops
 * the save. Binary plists are written back as XML (the UI warns first).
 */
export async function saveAgent(
  path: unknown,
  input: unknown,
  options: unknown,
  deps: SaveDeps
): Promise<SaveAgentResult> {
  try {
    const current = await readAgent(path, deps.writableDirs).catch((e: Error) =>
      failWith(`This agent can’t be edited: ${e.message}`)
    )
    const file = current.summary.path
    if (current.summary.readOnly) failWith('System agents are read-only')
    if ((await lstat(file)).isSymbolicLink()) {
      failWith('This plist is a symlink; Agent Desk won’t replace it. Edit the file it points to.')
    }

    const baseHash =
      typeof options === 'object' && options !== null
        ? (options as { baseHash?: unknown }).baseHash
        : undefined
    if (typeof baseHash !== 'string' || baseHash !== current.hash) {
      return {
        ok: false,
        conflict: true,
        error: 'The file changed on disk since you opened it. Close the editor and reopen it.'
      }
    }

    const { data, xml } = readPlistInput(input)
    const label = checkAgentData(data)
    if (label !== current.summary.label) {
      failWith('Changing the Label is not supported: launchd and the file name use it', {
        fieldErrors: { label: `Keep the Label as ${current.summary.label ?? '(none)'}` }
      })
    }

    const lint = await deps.lint(xml)
    if (!lint.ok) failWith('plutil -lint rejected the plist', { lint: lint.message })

    const logs = [data.StandardOutPath, data.StandardErrorPath].map((p) =>
      typeof p === 'string' ? p : undefined
    )
    await ensureLogDirs(logs, deps.roots)

    const target = await assertWritablePath(file, deps.roots)
    let backupPath: string
    try {
      backupPath = await backupAgentFile(file, label, { dir: deps.backupDir, roots: deps.roots })
    } catch (e) {
      if (e instanceof BackupError) failWith(`${e.message}. Nothing was saved.`)
      throw e
    }

    // Last check right before replacing: the file must still be what was backed up
    if (contentHash(await readFile(target)) !== baseHash) {
      return {
        ok: false,
        conflict: true,
        error: 'The file changed on disk while saving. Nothing was saved.'
      }
    }

    const { mode } = await lstat(target)
    const temp = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`)
    try {
      await writeFile(temp, xml, { flag: 'wx', mode: 0o600 })
      await chmod(temp, mode & 0o777)
      await rename(temp, target)
    } finally {
      await rm(temp, { force: true })
    }
    return { ok: true, backupPath }
  } catch (e) {
    if (e instanceof EditFailure) return e.result
    return { ok: false, error: (e as Error).message }
  }
}
