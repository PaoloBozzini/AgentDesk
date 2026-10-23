import type { PlistDict, PlistValue } from '../../../shared/plist-types'

/** Common keys first, in a sensible reading order; everything else alphabetically after. */
const KEY_ORDER = [
  'Label',
  'Program',
  'ProgramArguments',
  'RunAtLoad',
  'KeepAlive',
  'StartInterval',
  'StartCalendarInterval',
  'WatchPaths',
  'QueueDirectories',
  'WorkingDirectory',
  'EnvironmentVariables',
  'StandardOutPath',
  'StandardErrorPath',
  'Disabled'
]

export function orderedKeys(dict: PlistDict): string[] {
  const rank = (k: string): number => {
    const i = KEY_ORDER.indexOf(k)
    return i === -1 ? KEY_ORDER.length : i
  }
  return Object.keys(dict).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

export type ValueKind = 'dict' | 'array' | 'scalar'

export function kindOf(value: PlistValue): ValueKind {
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date || value instanceof Uint8Array) return 'scalar'
  return typeof value === 'object' ? 'dict' : 'scalar'
}

export function formatScalar(value: PlistValue): string {
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) return `<${value.byteLength} bytes of data>`
  if (typeof value === 'string') return value === '' ? '""' : value
  return String(value)
}
