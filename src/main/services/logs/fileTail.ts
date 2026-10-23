import { open, stat } from 'fs/promises'
import { StringDecoder } from 'string_decoder'
import type { FileStatus } from '../../../shared/log-types'

export interface FileTailHandlers {
  /** Replace the whole view (first read, truncation, rotation, file reappeared). */
  onReset(text: string, truncated: boolean): void
  onAppend(text: string): void
  onStatus(status: FileStatus): void
}

export interface FileTailOptions {
  pollMs?: number
  /** How much of an existing file to show initially / after a reset. */
  initialBytes?: number
  /** Cap on a single read, so a huge burst can't stall the main process. */
  maxReadBytes?: number
}

/**
 * Live tail of a log file by polling `stat` and reading from a stored offset.
 * Handles: file missing (waits for it), unreadable, truncation (`> file`),
 * rotation (new inode), and multi-byte UTF-8 split across reads.
 */
export class FileTail {
  private offset = 0
  private ino: number | undefined
  private timer: NodeJS.Timeout | null = null
  private busy = false
  private stopped = false
  private lastStatus = ''
  private decoder = new StringDecoder('utf8')
  private readonly pollMs: number
  private readonly initialBytes: number
  private readonly maxReadBytes: number

  private readonly handlers: FileTailHandlers

  constructor(
    private readonly path: string,
    handlers: FileTailHandlers,
    options: FileTailOptions = {}
  ) {
    // A read in flight when stop() is called must not emit afterwards
    this.handlers = {
      onReset: (text, truncated) => !this.stopped && handlers.onReset(text, truncated),
      onAppend: (text) => !this.stopped && handlers.onAppend(text),
      onStatus: (status) => !this.stopped && handlers.onStatus(status)
    }
    this.pollMs = options.pollMs ?? 500
    this.initialBytes = options.initialBytes ?? 64 * 1024
    this.maxReadBytes = options.maxReadBytes ?? 1024 * 1024
  }

  async start(): Promise<void> {
    await this.tick(true)
    if (!this.stopped) this.timer = setInterval(() => void this.tick(false), this.pollMs)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private status(status: FileStatus): void {
    const key = JSON.stringify(status)
    if (key === this.lastStatus) return
    this.lastStatus = key
    this.handlers.onStatus(status)
  }

  private async tick(first: boolean): Promise<void> {
    if (this.busy || this.stopped) return
    this.busy = true
    try {
      await this.poll(first)
    } finally {
      this.busy = false
    }
  }

  private async poll(first: boolean): Promise<void> {
    let info
    try {
      info = await stat(this.path)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        if (this.ino !== undefined || first) this.handlers.onReset('', false)
        this.ino = undefined
        this.offset = 0
        this.status({ state: 'missing' })
      } else {
        this.status({ state: 'unreadable', message: (e as Error).message })
      }
      return
    }
    if (!info.isFile()) {
      this.status({ state: 'not-a-file' })
      return
    }

    const rotated = this.ino !== undefined && info.ino !== this.ino
    const truncated = info.size < this.offset
    if (first || rotated || truncated || this.ino === undefined) {
      this.ino = info.ino
      this.decoder = new StringDecoder('utf8')
      const start = Math.max(0, info.size - this.initialBytes)
      const text = await this.read(start, info.size)
      if (text === null) return
      this.offset = info.size
      this.handlers.onReset(text, start > 0)
    } else if (info.size > this.offset) {
      const end = Math.min(info.size, this.offset + this.maxReadBytes)
      const text = await this.read(this.offset, end)
      if (text === null) return
      this.offset = end
      if (text) this.handlers.onAppend(text)
    }
    this.status({ state: 'ok', size: info.size })
  }

  private async read(start: number, end: number): Promise<string | null> {
    if (end <= start) return ''
    let handle
    try {
      handle = await open(this.path, 'r')
      const buf = Buffer.alloc(end - start)
      const { bytesRead } = await handle.read(buf, 0, buf.length, start)
      return this.decoder.write(buf.subarray(0, bytesRead))
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') this.status({ state: 'missing' })
      else this.status({ state: 'unreadable', message: (e as Error).message })
      return null
    } finally {
      await handle?.close()
    }
  }
}
