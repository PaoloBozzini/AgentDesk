/**
 * Pure mapping between the agent editor's form model and a launchd plist dict.
 *
 * Round-trip rule: `formToPlist(plistToForm(d))` gives back `d` (same keys,
 * same values, same key order). Anything the form can't represent losslessly
 * stays raw in `extra`: unknown keys, and managed keys whose value has an
 * unexpected shape (those are also listed in `unsupported`, so the UI can say
 * "edit this one in XML"). A form field that is filled in always wins over the
 * raw value in `extra`.
 *
 * Form values are strings where the user types (so "abc" in a number field is
 * representable and gets a field-level error instead of being lost).
 */
import { isValidLabel } from './label'
import type { PlistDict, PlistValue } from './plist-types'

/** Managed keys, in the order new keys are written. */
export const MANAGED_KEYS = [
  'Label',
  'Program',
  'ProgramArguments',
  'RunAtLoad',
  'KeepAlive',
  'StartInterval',
  'StartCalendarInterval',
  'WatchPaths',
  'WorkingDirectory',
  'EnvironmentVariables',
  'StandardOutPath',
  'StandardErrorPath'
] as const

export type ManagedKey = (typeof MANAGED_KEYS)[number]

/** `unset` = key absent; keeps an explicit `<false/>` distinct from no key. */
export type TriState = 'unset' | 'true' | 'false'

export interface KeepAliveForm {
  mode: 'unset' | 'always' | 'never' | 'conditional'
  /** Only used when mode is `conditional`. */
  successfulExit: TriState
  crashed: TriState
  /** Other conditions (PathState, OtherJobEnabled, …), kept as-is. */
  other: PlistDict
}

export const CALENDAR_FIELDS = ['minute', 'hour', 'day', 'weekday', 'month'] as const
export type CalendarField = (typeof CALENDAR_FIELDS)[number]
export type CalendarEntryForm = Record<CalendarField, string>

export interface EnvVarForm {
  key: string
  value: string
}

export interface AgentForm {
  label: string
  program: string
  programArguments: string[]
  runAtLoad: TriState
  keepAlive: KeepAliveForm
  startInterval: string
  startCalendarInterval: CalendarEntryForm[]
  /** Write StartCalendarInterval as an array even with a single entry. */
  calendarAsArray: boolean
  watchPaths: string[]
  workingDirectory: string
  environmentVariables: EnvVarForm[]
  standardOutPath: string
  standardErrorPath: string
  /** Unmanaged keys, plus managed keys listed in `unsupported`. */
  extra: PlistDict
  /** Managed keys whose value the form can't represent; kept raw in `extra`. */
  unsupported: ManagedKey[]
  /** Key order of the source plist, so saves produce minimal diffs. */
  keyOrder: string[]
}

/**
 * Field path → message. Paths: `label`, `program`, `programArguments`,
 * `programArguments.<i>`, `keepAlive`, `startInterval`,
 * `startCalendarInterval.<i>.<field>`, `watchPaths.<i>`, `workingDirectory`,
 * `environmentVariables.<i>.key`, `environmentVariables.<i>.value`,
 * `standardOutPath`, `standardErrorPath`.
 */
export type FormErrors = Record<string, string>

export type FormToPlistResult = { ok: true; data: PlistDict } | { ok: false; errors: FormErrors }

const CALENDAR_PLIST_KEYS: Record<CalendarField, string> = {
  minute: 'Minute',
  hour: 'Hour',
  day: 'Day',
  weekday: 'Weekday',
  month: 'Month'
}

/** Inclusive ranges from launchd.plist(5). Weekday 0 and 7 are both Sunday. */
const CALENDAR_RANGES: Record<CalendarField, [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  day: [1, 31],
  weekday: [0, 7],
  month: [1, 12]
}

const MAX_INT32 = 2 ** 31 - 1
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export function emptyCalendarEntry(): CalendarEntryForm {
  return { minute: '', hour: '', day: '', weekday: '', month: '' }
}

export function emptyAgentForm(): AgentForm {
  return {
    label: '',
    program: '',
    programArguments: [],
    runAtLoad: 'unset',
    keepAlive: { mode: 'unset', successfulExit: 'unset', crashed: 'unset', other: {} },
    startInterval: '',
    startCalendarInterval: [],
    calendarAsArray: false,
    watchPaths: [],
    workingDirectory: '',
    environmentVariables: [],
    standardOutPath: '',
    standardErrorPath: '',
    extra: {},
    unsupported: [],
    keyOrder: []
  }
}

// ---------------------------------------------------------------------------
// plist → form

function isDict(value: unknown): value is PlistDict {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array)
  )
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v !== ''
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string')
const isNonNegInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0

const triState = (v: boolean): TriState => (v ? 'true' : 'false')

function readKeepAlive(v: PlistValue): KeepAliveForm | undefined {
  if (typeof v === 'boolean') {
    return { mode: v ? 'always' : 'never', successfulExit: 'unset', crashed: 'unset', other: {} }
  }
  if (!isDict(v) || Object.keys(v).length === 0) return undefined
  const { SuccessfulExit, Crashed, ...other } = v
  if (SuccessfulExit !== undefined && typeof SuccessfulExit !== 'boolean') return undefined
  if (Crashed !== undefined && typeof Crashed !== 'boolean') return undefined
  return {
    mode: 'conditional',
    successfulExit: SuccessfulExit === undefined ? 'unset' : triState(SuccessfulExit),
    crashed: Crashed === undefined ? 'unset' : triState(Crashed),
    other
  }
}

function readCalendarEntry(v: PlistValue): CalendarEntryForm | undefined {
  if (!isDict(v)) return undefined
  const known = Object.values(CALENDAR_PLIST_KEYS)
  if (Object.keys(v).some((k) => !known.includes(k))) return undefined
  const entry = emptyCalendarEntry()
  for (const field of CALENDAR_FIELDS) {
    const raw = v[CALENDAR_PLIST_KEYS[field]]
    if (raw === undefined) continue
    if (!isNonNegInt(raw)) return undefined
    entry[field] = String(raw)
  }
  return entry
}

function readEnv(v: PlistValue): EnvVarForm[] | undefined {
  if (!isDict(v) || Object.keys(v).length === 0) return undefined
  const entries = Object.entries(v)
  if (!entries.every(([, value]) => typeof value === 'string')) return undefined
  return entries.map(([key, value]) => ({ key, value: value as string }))
}

/** Applies one managed key to the form; returns false when the value isn't representable. */
function readManaged(form: AgentForm, key: ManagedKey, v: PlistValue): boolean {
  switch (key) {
    case 'Label':
    case 'Program':
    case 'WorkingDirectory':
    case 'StandardOutPath':
    case 'StandardErrorPath': {
      if (!isNonEmptyString(v)) return false
      const field = {
        Label: 'label',
        Program: 'program',
        WorkingDirectory: 'workingDirectory',
        StandardOutPath: 'standardOutPath',
        StandardErrorPath: 'standardErrorPath'
      } as const
      form[field[key]] = v
      return true
    }
    case 'ProgramArguments':
    case 'WatchPaths': {
      if (!isStringArray(v) || v.length === 0) return false
      form[key === 'ProgramArguments' ? 'programArguments' : 'watchPaths'] = [...v]
      return true
    }
    case 'RunAtLoad':
      if (typeof v !== 'boolean') return false
      form.runAtLoad = triState(v)
      return true
    case 'KeepAlive': {
      const keepAlive = readKeepAlive(v)
      if (!keepAlive) return false
      form.keepAlive = keepAlive
      return true
    }
    case 'StartInterval':
      if (!isNonNegInt(v)) return false
      form.startInterval = String(v)
      return true
    case 'StartCalendarInterval': {
      const list = Array.isArray(v) ? v : [v]
      if (list.length === 0) return false
      const entries = list.map(readCalendarEntry)
      if (entries.some((e) => e === undefined)) return false
      form.startCalendarInterval = entries as CalendarEntryForm[]
      form.calendarAsArray = Array.isArray(v)
      return true
    }
    case 'EnvironmentVariables': {
      const env = readEnv(v)
      if (!env) return false
      form.environmentVariables = env
      return true
    }
  }
}

const isManagedKey = (key: string): key is ManagedKey =>
  (MANAGED_KEYS as readonly string[]).includes(key)

export function plistToForm(data: PlistDict): AgentForm {
  const form = emptyAgentForm()
  form.keyOrder = Object.keys(data)
  for (const [key, value] of Object.entries(data)) {
    if (isManagedKey(key)) {
      if (readManaged(form, key, value)) continue
      form.unsupported.push(key)
    }
    form.extra[key] = value
  }
  return form
}

// ---------------------------------------------------------------------------
// validation

function stringError(s: string): string | undefined {
  if (s.includes('\0')) return 'Contains a NUL character'
  return undefined
}

function pathError(s: string): string | undefined {
  if (s.startsWith('~')) return 'Use an absolute path; launchd does not expand ~'
  if (!s.startsWith('/')) return 'Must be an absolute path'
  return stringError(s)
}

/** `undefined` when blank; NaN when not a plain non-negative integer. */
function parseIntField(s: string): number | undefined {
  const t = s.trim()
  if (t === '') return undefined
  return /^\d+$/.test(t) ? Number(t) : NaN
}

export function validateAgentForm(form: AgentForm): FormErrors {
  const errors: FormErrors = {}
  const set = (path: string, msg: string | undefined): void => {
    if (msg && !errors[path]) errors[path] = msg
  }
  const inExtra = (key: ManagedKey): boolean => key in form.extra

  // Label
  if (form.label === '') {
    if (!inExtra('Label')) set('label', 'Label is required')
  } else if (!isValidLabel(form.label)) {
    set(
      'label',
      'Use letters, digits, . _ - @; start with a letter or digit; no empty segments or trailing dot'
    )
  }

  // Program / ProgramArguments
  if (form.program !== '') set('program', pathError(form.program))
  form.programArguments.forEach((arg, i) => set(`programArguments.${i}`, stringError(arg)))
  const hasProgram = form.program !== '' || inExtra('Program')
  const hasArgs = form.programArguments.length > 0 || inExtra('ProgramArguments')
  if (!hasProgram && !hasArgs) {
    set('program', 'Set Program or ProgramArguments')
  } else if (!hasProgram && form.programArguments.length > 0 && form.programArguments[0] === '') {
    set('programArguments.0', 'The first argument is the executable; it cannot be empty')
  }

  // KeepAlive
  const ka = form.keepAlive
  if (
    ka.mode === 'conditional' &&
    ka.successfulExit === 'unset' &&
    ka.crashed === 'unset' &&
    Object.keys(ka.other).length === 0
  ) {
    set('keepAlive', 'Pick at least one condition')
  }

  // StartInterval
  const interval = parseIntField(form.startInterval)
  if (interval !== undefined && !(interval >= 1 && interval <= MAX_INT32)) {
    set('startInterval', 'Enter a whole number of seconds (1 or more)')
  }

  // StartCalendarInterval
  form.startCalendarInterval.forEach((entry, i) => {
    for (const field of CALENDAR_FIELDS) {
      const n = parseIntField(entry[field])
      const [min, max] = CALENDAR_RANGES[field]
      if (n !== undefined && !(n >= min && n <= max)) {
        set(`startCalendarInterval.${i}.${field}`, `Enter ${min}–${max}, or leave blank for any`)
      }
    }
  })

  // Paths
  form.watchPaths.forEach((p, i) =>
    set(`watchPaths.${i}`, p === '' ? 'Path cannot be empty' : pathError(p))
  )
  for (const field of ['workingDirectory', 'standardOutPath', 'standardErrorPath'] as const) {
    if (form[field] !== '') set(field, pathError(form[field]))
  }

  // EnvironmentVariables
  const seen = new Set<string>()
  form.environmentVariables.forEach(({ key, value }, i) => {
    if (key === '') set(`environmentVariables.${i}.key`, 'Name is required')
    else if (!ENV_NAME.test(key)) {
      set(`environmentVariables.${i}.key`, 'Use letters, digits and _; do not start with a digit')
    } else if (seen.has(key)) set(`environmentVariables.${i}.key`, `Duplicate variable ${key}`)
    seen.add(key)
    set(`environmentVariables.${i}.value`, stringError(value))
  })

  return errors
}

// ---------------------------------------------------------------------------
// form → plist

const fromTriState = (t: TriState): boolean | undefined =>
  t === 'unset' ? undefined : t === 'true'
const orUndefined = (s: string): string | undefined => (s === '' ? undefined : s)

function writeKeepAlive(ka: KeepAliveForm): PlistValue | undefined {
  switch (ka.mode) {
    case 'unset':
      return undefined
    case 'always':
      return true
    case 'never':
      return false
    case 'conditional': {
      const dict: PlistDict = {}
      const successfulExit = fromTriState(ka.successfulExit)
      const crashed = fromTriState(ka.crashed)
      if (successfulExit !== undefined) dict.SuccessfulExit = successfulExit
      if (crashed !== undefined) dict.Crashed = crashed
      return { ...dict, ...ka.other }
    }
  }
}

function writeCalendar(form: AgentForm): PlistValue | undefined {
  const entries = form.startCalendarInterval.map((entry) => {
    const dict: PlistDict = {}
    for (const field of CALENDAR_FIELDS) {
      const n = parseIntField(entry[field])
      if (n !== undefined) dict[CALENDAR_PLIST_KEYS[field]] = n
    }
    return dict
  })
  if (entries.length === 0) return undefined
  return entries.length === 1 && !form.calendarAsArray ? entries[0] : entries
}

/** Managed values from the form; `undefined` = field left blank. Assumes a valid form. */
function managedValues(form: AgentForm): Record<ManagedKey, PlistValue | undefined> {
  const interval = parseIntField(form.startInterval)
  return {
    Label: orUndefined(form.label),
    Program: orUndefined(form.program),
    ProgramArguments: form.programArguments.length ? [...form.programArguments] : undefined,
    RunAtLoad: fromTriState(form.runAtLoad),
    KeepAlive: writeKeepAlive(form.keepAlive),
    StartInterval: interval,
    StartCalendarInterval: writeCalendar(form),
    WatchPaths: form.watchPaths.length ? [...form.watchPaths] : undefined,
    WorkingDirectory: orUndefined(form.workingDirectory),
    EnvironmentVariables: form.environmentVariables.length
      ? Object.fromEntries(form.environmentVariables.map(({ key, value }) => [key, value]))
      : undefined,
    StandardOutPath: orUndefined(form.standardOutPath),
    StandardErrorPath: orUndefined(form.standardErrorPath)
  }
}

export function formToPlist(form: AgentForm): FormToPlistResult {
  const errors = validateAgentForm(form)
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  const managed = managedValues(form)
  const valueOf = (key: string): PlistValue | undefined =>
    (isManagedKey(key) ? managed[key] : undefined) ?? form.extra[key]

  // Source order first, then new managed keys in canonical order, then new extra keys.
  const order = [...new Set([...form.keyOrder, ...MANAGED_KEYS, ...Object.keys(form.extra)])]
  const data: PlistDict = {}
  for (const key of order) {
    const value = valueOf(key)
    if (value !== undefined) data[key] = value
  }
  return { ok: true, data }
}
