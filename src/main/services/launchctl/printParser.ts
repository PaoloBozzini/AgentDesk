import type { ServiceStatus } from '../../../shared/launchd-types'

/**
 * Pure parser for `launchctl print gui/<uid>/<label>`.
 *
 * Apple documents this output as unstable, so: only top-level `key = value`
 * lines are read (nested blocks like event triggers have their own pid/state
 * keys), unknown keys are kept in `fields`, and anything missing or malformed
 * is left undefined. It never throws.
 */

const HEADER = /^(?:[a-z]+\/\d+\/)?(.+?) = \{$/
const PAIR = /^([^=]+?) = (.*)$/

function toInt(value: string | undefined): number | undefined {
  if (value === undefined || !/^-?\d+$/.test(value)) return undefined
  return Number(value)
}

export function parsePrintService(text: string): ServiceStatus {
  const fields: Record<string, string> = {}
  let label: string | undefined
  let args: string[] | undefined
  let depth = 0
  let inArguments = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    if (depth === 0) {
      const header = HEADER.exec(line)
      if (header) {
        label = header[1]
        depth = 1
      }
      continue
    }

    if (line === '}') {
      depth--
      inArguments = false
      continue
    }

    if (depth === 1) {
      if (line === 'arguments = {') {
        args = []
        inArguments = true
        depth++
        continue
      }
      if (line.endsWith('{')) {
        depth++
        continue
      }
      const pair = PAIR.exec(line)
      if (pair) fields[pair[1]] = pair[2]
      continue
    }

    if (inArguments && depth === 2) {
      args!.push(line)
      continue
    }
    if (line.endsWith('{')) depth++
  }

  return buildStatus(label, fields, args)
}

function buildStatus(
  label: string | undefined,
  fields: Record<string, string>,
  args: string[] | undefined
): ServiceStatus {
  const status: ServiceStatus = {
    label,
    state: fields['state'],
    running: fields['state'] === 'running',
    neverExited: false,
    fields
  }

  const pid = toInt(fields['pid'])
  if (pid !== undefined) status.pid = pid
  const runs = toInt(fields['runs'])
  if (runs !== undefined) status.runs = runs

  const exit = fields['last exit code']
  if (exit !== undefined) {
    if (exit === '(never exited)') {
      status.neverExited = true
    } else {
      const m = /^(-?\d+)(?::\s*(.+))?$/.exec(exit)
      if (m) {
        status.lastExitCode = Number(m[1])
        if (m[2]) status.lastExitReason = m[2]
      }
    }
  }

  const signal = fields['last terminating signal']
  if (signal !== undefined) {
    const m = /^(.+?):\s*(\d+)$/.exec(signal)
    status.lastSignal = m ? { name: m[1], number: Number(m[2]) } : { name: signal }
  }

  const strings: [keyof ServiceStatus, string][] = [
    ['program', 'program'],
    ['path', 'path'],
    ['type', 'type'],
    ['stdoutPath', 'stdout path'],
    ['stderrPath', 'stderr path']
  ]
  for (const [prop, key] of strings) {
    if (fields[key] !== undefined) (status as unknown as Record<string, string>)[prop] = fields[key]
  }
  if (args) status.arguments = args

  if (label === undefined) delete status.label
  if (status.state === undefined) delete status.state
  return status
}
