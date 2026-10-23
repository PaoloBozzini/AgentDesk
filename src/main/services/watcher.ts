import { watch, type FSWatcher } from 'fs'
import { access } from 'fs/promises'

export interface FolderWatcherOptions {
  /** Coalesce bursts of fs events (editors write temp files, rename, chmod…). */
  debounceMs?: number
  /** How often to check for the folder when it doesn't exist (or was removed). */
  pollMs?: number
}

/**
 * Watches a folder and calls `onChange` (debounced) when anything inside it
 * changes. Survives the folder not existing yet, or being deleted and
 * recreated, by falling back to polling for it.
 */
export class FolderWatcher {
  private watcher: FSWatcher | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private stopped = false
  private readonly debounceMs: number
  private readonly pollMs: number

  constructor(
    private readonly dir: string,
    private readonly onChange: () => void,
    options: FolderWatcherOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? 250
    this.pollMs = options.pollMs ?? 5000
  }

  start(): void {
    this.stopped = false
    this.attach()
  }

  stop(): void {
    this.stopped = true
    this.watcher?.close()
    this.watcher = null
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = null
  }

  get isWatching(): boolean {
    return this.watcher !== null
  }

  private attach(): void {
    if (this.stopped) return
    try {
      this.watcher = watch(this.dir, { persistent: false }, () => this.onEvent())
      this.watcher.on('error', () => this.fallBackToPolling())
    } catch {
      this.fallBackToPolling()
    }
  }

  private onEvent(): void {
    this.schedule()
    // On macOS, deleting the watched folder doesn't always emit 'error':
    // check it still exists, or we'd keep watching a dead inode.
    access(this.dir).catch(() => this.fallBackToPolling())
  }

  private fallBackToPolling(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.stopped || this.pollTimer) return
    // The folder vanished (or never existed): the list just changed too
    this.schedule()
    this.pollTimer = setInterval(async () => {
      try {
        await access(this.dir)
      } catch {
        return
      }
      if (this.pollTimer) clearInterval(this.pollTimer)
      this.pollTimer = null
      this.attach()
      this.schedule()
    }, this.pollMs)
  }

  private schedule(): void {
    if (this.stopped) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      if (!this.stopped) this.onChange()
    }, this.debounceMs)
  }
}
