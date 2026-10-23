import { spawn, type ChildProcess, type SpawnOptions } from 'child_process'
import { randomUUID } from 'crypto'

/**
 * Tracks long-lived resources (log stream children, file watchers) per owner
 * (a webContents id), so they can be released when a view unsubscribes, its
 * window goes away, or the app quits.
 */
export class ProcessRegistry {
  private readonly entries = new Map<string, { owner: number; dispose: () => void }>()

  get size(): number {
    return this.entries.size
  }

  add(owner: number, dispose: () => void): string {
    const id = randomUUID()
    this.entries.set(id, { owner, dispose })
    return id
  }

  /** Drop an entry without calling its disposer (the resource already ended). */
  forget(id: string): void {
    this.entries.delete(id)
  }

  owns(id: string, owner: number): boolean {
    return this.entries.get(id)?.owner === owner
  }

  dispose(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    this.entries.delete(id)
    try {
      entry.dispose()
    } catch {
      // A failing disposer must not keep other resources alive
    }
  }

  disposeOwner(owner: number): void {
    for (const [id, entry] of this.entries) if (entry.owner === owner) this.dispose(id)
  }

  disposeAll(): void {
    for (const id of [...this.entries.keys()]) this.dispose(id)
  }
}

/** Every child spawned through spawnTracked that hasn't exited yet. */
const liveChildren = new Set<ChildProcess>()

/** Last resort on process exit: synchronous SIGKILL for anything still running. */
export function killAllChildrenNow(): void {
  for (const child of liveChildren) {
    try {
      child.kill('SIGKILL')
    } catch {
      // already gone
    }
  }
  liveChildren.clear()
}

export function liveChildCount(): number {
  return liveChildren.size
}

export function isAlive(pid: number | undefined): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export interface TrackedChild {
  process: ChildProcess
  pid: number | undefined
  readonly exited: boolean
  /** SIGTERM, then SIGKILL after the grace period. Resolves once the child is gone. */
  kill(): Promise<void>
}

/** spawn with an argument array (never a shell) plus reliable termination. */
export function spawnTracked(
  file: string,
  args: string[],
  options: { killGraceMs?: number; env?: NodeJS.ProcessEnv } = {}
): TrackedChild {
  const spawnOptions: SpawnOptions = {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: options.env ?? process.env
  }
  const child = spawn(file, args, spawnOptions)
  liveChildren.add(child)
  let exited = false
  const exitPromise = new Promise<void>((resolve) => {
    const done = (): void => {
      exited = true
      liveChildren.delete(child)
      resolve()
    }
    child.once('exit', done)
    child.once('error', done)
  })

  return {
    process: child,
    pid: child.pid,
    get exited() {
      return exited
    },
    async kill() {
      if (exited) return
      child.kill('SIGTERM')
      const timer = setTimeout(() => {
        if (!exited) child.kill('SIGKILL')
      }, options.killGraceMs ?? 2000)
      await exitPromise
      clearTimeout(timer)
    }
  }
}
