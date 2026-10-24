import { readFile } from 'fs/promises'
import type { ActionResult } from '../../shared/control-types'
import type { DeleteAgentResult } from '../../shared/edit-types'
import { isValidLabel } from '../../shared/label'
import { resolveAgentFile, type AgentDir } from './agents'
import { backupAgentFile, BackupError } from './backup'
import { assertWritablePath } from './paths'
import { parsePlistBuffer } from './plist'

export interface DeleteDeps {
  /** Only user folders: system agents can't be deleted. */
  writableDirs: AgentDir[]
  roots: string[]
  /** `backupsDir(home)` */
  backupDir: string
  isLoaded: (label: string) => Promise<boolean>
  /** Bootout of the agent at `path`. */
  unload: (path: string) => Promise<ActionResult>
  /** Move to the Trash (Electron `shell.trashItem`). Never unlink. */
  trash: (path: string) => Promise<void>
}

/** Label from the file, if it parses and has a valid one; broken files can still be deleted. */
async function labelOf(path: string): Promise<string | undefined> {
  try {
    const label = parsePlistBuffer(await readFile(path)).data.Label
    return isValidLabel(label) ? label : undefined
  } catch {
    return undefined
  }
}

/**
 * Safe delete: bootout if loaded → backup → move to Trash. Each step must
 * succeed before the next; the file is never unlinked.
 */
export async function deleteAgent(path: unknown, deps: DeleteDeps): Promise<DeleteAgentResult> {
  let file: string
  try {
    const resolved = resolveAgentFile(path, deps.writableDirs)
    if (resolved.scope !== 'user') return { ok: false, error: 'System agents can’t be deleted' }
    file = resolved.path
    await assertWritablePath(file, deps.roots)
  } catch (e) {
    return { ok: false, error: `This agent can’t be deleted: ${(e as Error).message}` }
  }

  try {
    const label = await labelOf(file)
    let unloaded = false
    if (label && (await deps.isLoaded(label))) {
      const result = await deps.unload(file)
      if (!result.ok) {
        return {
          ok: false,
          error: 'Unloading failed, so nothing was deleted',
          unloadError: result.error
        }
      }
      unloaded = true
    }

    let backupPath: string
    try {
      backupPath = await backupAgentFile(file, label, { dir: deps.backupDir, roots: deps.roots })
    } catch (e) {
      if (e instanceof BackupError) {
        return { ok: false, error: `${e.message}. Nothing was deleted.` }
      }
      throw e
    }

    await deps.trash(file)
    return { ok: true, backupPath, unloaded }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
