import type { UnifiedLogLine } from './log-types'

/** Unified log timestamps ("2026-10-23 22:40:24.714501+0200") sort lexically within one zone offset. */
export function mergeByTime(...groups: UnifiedLogLine[][]): UnifiedLogLine[] {
  return groups
    .flat()
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0))
}
