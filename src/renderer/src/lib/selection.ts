/**
 * Arrow-key navigation in the agent list: the path `delta` rows away from
 * `current`, clamped to the list. With nothing selected, Down picks the first
 * row and Up the last.
 */
export function stepSelection(
  paths: string[],
  current: string | null,
  delta: number
): string | null {
  if (paths.length === 0) return null
  const index = current === null ? -1 : paths.indexOf(current)
  if (index === -1) return delta > 0 ? paths[0] : paths[paths.length - 1]
  return paths[Math.min(paths.length - 1, Math.max(0, index + delta))]
}

/** Keys typed into a field must not move the list selection. */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable === true
  )
}
