/**
 * Pure parsers for `launchctl print gui/<uid>` / `launchctl print system`
 * (the `services` and `disabled services` blocks) and `launchctl print-disabled`.
 * Like the service parser: tolerant, never throws, unknown lines ignored.
 */

export interface DomainService {
  label: string
  /** Undefined when launchd reports 0 (not running). */
  pid?: number
  /** Last exit status; negative numbers are signals (e.g. -9 = SIGKILL). */
  lastExitStatus?: number
  /** Raw status column: a number, "-" (never exited) or e.g. "(pe)". */
  statusText: string
}

export interface DomainStatus {
  services: Map<string, DomainService>
  /** label -> true when disabled. Undefined when the block wasn't present. */
  overrides?: Map<string, boolean>
}

const SERVICE_LINE = /^(\d+)\s+(\S+)\s+(\S.*)$/
const OVERRIDE_LINE = /^"(.+)"\s*=>\s*(\S+)$/

/** Lines directly inside the first top-level `<name> = {` block (nested blocks skipped). */
function blockLines(text: string, name: string): string[] | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const start = lines.indexOf(`${name} = {`)
  if (start === -1) return undefined
  const out: string[] = []
  let depth = 1
  for (let i = start + 1; i < lines.length && depth > 0; i++) {
    const line = lines[i]
    if (line === '}') depth--
    else if (line.endsWith('{')) depth++
    else if (depth === 1 && line) out.push(line)
  }
  return out
}

export function parseDisabledBlock(text: string): Map<string, boolean> | undefined {
  const lines = blockLines(text, 'disabled services')
  if (!lines) return undefined
  const overrides = new Map<string, boolean>()
  for (const line of lines) {
    const m = OVERRIDE_LINE.exec(line)
    if (!m) continue
    const value = m[2].toLowerCase()
    // macOS 11+: enabled/disabled. Older releases: true/false meaning "disabled".
    if (value === 'disabled' || value === 'true') overrides.set(m[1], true)
    else if (value === 'enabled' || value === 'false') overrides.set(m[1], false)
  }
  return overrides
}

export function parseDomainPrint(text: string): DomainStatus {
  const services = new Map<string, DomainService>()
  for (const line of blockLines(text, 'services') ?? []) {
    const m = SERVICE_LINE.exec(line)
    if (!m) continue
    const pid = Number(m[1])
    const statusText = m[2]
    const service: DomainService = { label: m[3], statusText }
    if (pid > 0) service.pid = pid
    if (/^-?\d+$/.test(statusText)) service.lastExitStatus = Number(statusText)
    services.set(service.label, service)
  }
  return { services, overrides: parseDisabledBlock(text) }
}
