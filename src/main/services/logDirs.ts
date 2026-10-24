import { mkdir, stat } from 'fs/promises'
import { dirname } from 'path'
import { assertWritablePath, PathRestrictionError } from './paths'

/**
 * launchd does not create missing folders for StandardOutPath /
 * StandardErrorPath (the job fails to spawn instead), so the save flow creates
 * them. Only inside the allowed write roots: a missing folder elsewhere is an
 * error the user has to fix.
 *
 * Returns the folders that were created.
 */
export async function ensureLogDirs(
  logPaths: (string | undefined)[],
  roots: string[]
): Promise<string[]> {
  const created: string[] = []
  const dirs = [...new Set(logPaths.filter((p): p is string => !!p).map((p) => dirname(p)))]
  for (const dir of dirs) {
    if (await isDirectory(dir)) continue
    try {
      await assertWritablePath(dir, roots)
    } catch (e) {
      if (e instanceof PathRestrictionError) {
        throw new PathRestrictionError(
          `Log folder ${dir} does not exist and is outside the folders Agent Desk may create`
        )
      }
      throw e
    }
    await mkdir(dir, { recursive: true, mode: 0o755 })
    created.push(dir)
  }
  return created
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}
