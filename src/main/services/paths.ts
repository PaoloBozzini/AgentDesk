import { realpath } from 'fs'
import { lstat, readlink } from 'fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { promisify } from 'util'

// native realpath(3): also canonicalizes case on case-insensitive APFS
const realpathNative = promisify(realpath.native)

/**
 * Write-path restriction. Every filesystem write in main goes through
 * `assertWritablePath`, which resolves real paths (following symlinks in the
 * target and all ancestors) and rejects anything outside the allowed roots.
 *
 * Callers should write via temp file + rename in the same directory, so a
 * symlink swapped in after the check is replaced rather than followed.
 */

export class PathRestrictionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathRestrictionError'
  }
}

/** Agent Desk's own data folder (backups, temp files). */
export function appSupportDir(home: string): string {
  return join(home, 'Library', 'Application Support', 'Agent Desk')
}

export function writeRootsFor(home: string): string[] {
  return [join(home, 'Library', 'LaunchAgents'), appSupportDir(home), join(home, 'Library', 'Logs')]
}

export function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, resolve(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p)
    return true
  } catch {
    return false
  }
}

const MAX_SYMLINK_HOPS = 40

/**
 * Real path of `p`. If `p` (or some ancestors) don't exist yet, resolves the
 * nearest existing ancestor and appends the missing tail. Dangling symlinks
 * are followed manually so their (missing) target is what gets checked.
 */
export async function resolveRealPath(p: string, hops = 0): Promise<string> {
  if (hops > MAX_SYMLINK_HOPS) throw new PathRestrictionError(`Too many symlinks: ${p}`)
  const tail: string[] = []
  let current = resolve(p)
  while (!(await exists(current))) {
    const parent = dirname(current)
    if (parent === current) break
    tail.unshift(basename(current))
    current = parent
  }
  try {
    return join(await realpathNative(current), ...tail)
  } catch {
    // `current` exists per lstat but realpath failed: a dangling symlink in the chain
    const target = await readlink(current)
    return resolveRealPath(join(resolve(dirname(current), target), ...tail), hops + 1)
  }
}

export async function assertWritablePath(p: string, roots: string[]): Promise<string> {
  if (typeof p !== 'string' || p.length === 0) {
    throw new PathRestrictionError('Path must be a non-empty string')
  }
  if (p.includes('\0')) throw new PathRestrictionError('Path contains a NUL byte')
  if (!isAbsolute(p)) throw new PathRestrictionError(`Path must be absolute: ${p}`)

  const real = await resolveRealPath(p)
  for (const root of roots) {
    if (isInside(real, await resolveRealPath(root))) return real
  }
  throw new PathRestrictionError(`Write outside allowed folders rejected: ${p}`)
}
