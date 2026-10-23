import type { ActionError } from '../../../shared/control-types'

/** Display-only shell quoting so a copied command can be pasted into Terminal. */
export function quoteArg(arg: string): string {
  if (arg !== '' && /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

export function formatCommand(argv: string[]): string {
  return argv.map(quoteArg).join(' ')
}

/** Plain-text report for the clipboard. */
export function errorReport(action: string, error: ActionError): string {
  const lines = [`${action} failed: ${error.summary}`]
  if (error.hint) lines.push(error.hint)
  if (error.command.length) lines.push('', `$ ${formatCommand(error.command)}`)
  lines.push(`exit code: ${error.exitCode ?? 'none'}`)
  if (error.stderr.trim()) lines.push('', 'stderr:', error.stderr.trimEnd())
  if (error.stdout.trim()) lines.push('', 'stdout:', error.stdout.trimEnd())
  return lines.join('\n')
}
