import { defaultLogPaths, type LogPaths } from '../../../shared/agent-defaults'
import type { AgentForm } from '../../../shared/agent-form'
import { isValidLabel } from '../../../shared/label'

/** Textarea text ↔ list, one entry per line. Keeps blank lines so typing Enter works. */
export const listToLines = (list: string[]): string => list.join('\n')
export const linesToList = (text: string): string[] => (text === '' ? [] : text.split('\n'))

/**
 * Cleans what textareas leave behind before validating / saving: trailing
 * blank arguments (an empty argument in the middle may be intentional) and
 * blank watch paths.
 */
export function tidyForm(form: AgentForm): AgentForm {
  const args = [...form.programArguments]
  while (args.length > 0 && args[args.length - 1] === '') args.pop()
  return { ...form, programArguments: args, watchPaths: form.watchPaths.filter((p) => p !== '') }
}

/** "every 15 min" style hint for a StartInterval field; empty when not a whole number. */
export function intervalHint(seconds: string): string {
  const t = seconds.trim()
  if (!/^\d+$/.test(t) || Number(t) === 0) return ''
  const n = Number(t)
  const units: [number, string][] = [
    [86400, 'day'],
    [3600, 'h'],
    [60, 'min']
  ]
  for (const [size, unit] of units) {
    if (n % size === 0) {
      const count = n / size
      return unit === 'day'
        ? `every ${count} day${count === 1 ? '' : 's'}`
        : `every ${count} ${unit}`
    }
  }
  return `every ${n} s`
}

const LOG_FIELDS = [
  ['standardOutPath', 'stdout'],
  ['standardErrorPath', 'stderr']
] as const

function logDefaultsFor(label: string, home: string): LogPaths {
  return isValidLabel(label) ? defaultLogPaths(home, label) : { stdout: '', stderr: '' }
}

/**
 * New-agent log paths follow the label while they still hold the default for
 * the previous label (blank while the label was invalid). A path the user
 * typed or cleared is left alone.
 */
export function followLabel(prev: AgentForm, next: AgentForm, home: string): AgentForm {
  if (prev.label === next.label) return next
  const before = logDefaultsFor(prev.label, home)
  const after = logDefaultsFor(next.label, home)
  const out = { ...next }
  for (const [field, key] of LOG_FIELDS) {
    if (prev[field] === before[key] && next[field] === prev[field]) out[field] = after[key]
  }
  return out
}

/** Path for a separate stderr log next to the output log: `<dir>/errors.log`. */
export function errorsLogNextTo(outputPath: string): string {
  const slash = outputPath.lastIndexOf('/')
  return `${slash >= 0 ? outputPath.slice(0, slash) : ''}/errors.log`
}

/**
 * Program chosen in the file dialog. An app bundle can't be run by launchd
 * directly, so it becomes `/usr/bin/open -a <app>`. Otherwise the executable is
 * replaced and the arguments kept (argv[0] too, when there's no Program key).
 */
export function applyPickedProgram(form: AgentForm, path: string): AgentForm {
  const clean = path.replace(/\/+$/, '')
  if (clean.endsWith('.app')) {
    return { ...form, program: '', programArguments: ['/usr/bin/open', '-a', clean] }
  }
  if (!form.program && form.programArguments.length > 0) {
    return { ...form, programArguments: [clean, ...form.programArguments.slice(1)] }
  }
  return { ...form, program: clean }
}
