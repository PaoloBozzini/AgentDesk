/**
 * launchd label validation. Every label passes through here before it is used
 * in a launchctl argument, a service target (`gui/<uid>/<label>`) or a filename.
 *
 * Allowed: ASCII letters, digits, `.`, `_`, `-`, `@` (Homebrew uses
 * `name@version`). Must start with a letter or digit (so it can't look like a
 * CLI flag), must not end with a dot, and must not contain empty segments.
 */

export const MAX_LABEL_LENGTH = 255

const LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/

export class LabelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LabelError'
  }
}

export function isValidLabel(label: unknown): label is string {
  return (
    typeof label === 'string' &&
    label.length <= MAX_LABEL_LENGTH &&
    LABEL_PATTERN.test(label) &&
    !label.endsWith('.') &&
    !label.includes('..')
  )
}

export function assertValidLabel(label: unknown): string {
  if (!isValidLabel(label)) {
    const shown = typeof label === 'string' ? JSON.stringify(label.slice(0, 80)) : typeof label
    throw new LabelError(`Invalid launchd label: ${shown}`)
  }
  return label
}

/** Reverse-DNS style (`tld.domain.name`, at least three segments, alphabetic TLD). */
export function isReverseDnsLabel(label: string): boolean {
  if (!isValidLabel(label)) return false
  const segments = label.split('.')
  return segments.length >= 3 && /^[A-Za-z]+$/.test(segments[0])
}
