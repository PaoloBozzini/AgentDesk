import { execFile } from 'child_process'
import { isAbsolute } from 'path'
import { assertValidLabel } from '../../../shared/label'

export const LAUNCHCTL = '/bin/launchctl'
export const DEFAULT_TIMEOUT_MS = 15_000
const MAX_BUFFER = 32 * 1024 * 1024

export interface ExecResult {
  stdout: string
  stderr: string
  /** Process exit code; null when killed by a signal. */
  code: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
}

/** Injected so tests never run the real launchctl. */
export type ExecFn = (file: string, args: string[], timeoutMs: number) => Promise<ExecResult>

export const execFileAsync: ExecFn = (file, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: MAX_BUFFER, encoding: 'utf8', shell: false },
      (error, stdout, stderr) => {
        const err = error as
          (NodeJS.ErrnoException & { killed?: boolean; signal?: NodeJS.Signals }) | null
        resolve({
          stdout,
          stderr: stderr || (err && typeof err.code === 'string' ? err.message : ''),
          code: err ? (typeof err.code === 'number' ? err.code : null) : 0,
          signal: err?.signal ?? null,
          timedOut: Boolean(err?.killed && err.signal === 'SIGTERM')
        })
      }
    )
  })

export class LaunchctlError extends Error {
  readonly args: string[]
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean

  constructor(args: string[], result: ExecResult) {
    const why = result.timedOut
      ? 'timed out'
      : result.code === null
        ? `killed by ${result.signal ?? 'signal'}`
        : `exited with code ${result.code}`
    const first = (result.stderr || result.stdout).trim().split('\n').pop() ?? ''
    super(`launchctl ${args[0]} ${why}${first ? `: ${first}` : ''}`)
    this.name = 'LaunchctlError'
    this.args = args
    this.code = result.code
    this.stdout = result.stdout
    this.stderr = result.stderr
    this.timedOut = result.timedOut
  }

  /** `launchctl print` on a service that isn't loaded. */
  get isServiceNotFound(): boolean {
    return this.code === 113 || /Could not find service/i.test(this.stderr)
  }
}

export interface LaunchctlOptions {
  uid: number
  exec?: ExecFn
  timeoutMs?: number
}

/** Builds argument arrays. Every label is validated; never a shell string. */
export class LaunchctlCommands {
  constructor(private readonly uid: number) {
    if (!Number.isInteger(uid) || uid < 0) throw new Error(`Invalid uid: ${uid}`)
  }

  get domain(): string {
    return `gui/${this.uid}`
  }

  service(label: string): string {
    return `${this.domain}/${assertValidLabel(label)}`
  }

  printDomain(): string[] {
    return ['print', this.domain]
  }

  printService(label: string): string[] {
    return ['print', this.service(label)]
  }

  printDisabled(): string[] {
    return ['print-disabled', this.domain]
  }

  bootstrap(plistPath: string): string[] {
    if (!isAbsolute(plistPath) || plistPath.includes('\0')) {
      throw new Error('bootstrap needs an absolute plist path')
    }
    return ['bootstrap', this.domain, plistPath]
  }

  bootout(label: string): string[] {
    return ['bootout', this.service(label)]
  }

  kickstart(label: string, kill = false): string[] {
    return kill ? ['kickstart', '-k', this.service(label)] : ['kickstart', this.service(label)]
  }

  enable(label: string): string[] {
    return ['enable', this.service(label)]
  }

  disable(label: string): string[] {
    return ['disable', this.service(label)]
  }
}

export class Launchctl {
  readonly commands: LaunchctlCommands
  private readonly exec: ExecFn
  private readonly timeoutMs: number

  constructor({ uid, exec = execFileAsync, timeoutMs = DEFAULT_TIMEOUT_MS }: LaunchctlOptions) {
    this.commands = new LaunchctlCommands(uid)
    this.exec = exec
    this.timeoutMs = timeoutMs
  }

  /** Runs launchctl; resolves with stdout, rejects with LaunchctlError on any failure. */
  async run(args: string[]): Promise<string> {
    const result = await this.exec(LAUNCHCTL, args, this.timeoutMs)
    if (result.code !== 0 || result.timedOut) throw new LaunchctlError(args, result)
    return result.stdout
  }
}
