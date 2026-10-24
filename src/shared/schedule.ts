/**
 * StartCalendarInterval as human rules ("every Monday and Thursday at 13:30")
 * instead of raw Minute / Hour / Day / Weekday / Month fields. The form model
 * keeps the raw entries; the schedule editor converts both ways.
 *
 * A weekly rule with several days is several calendar entries (one per
 * weekday, same time); they are grouped back into one rule when read.
 * Anything that isn't one of the common shapes stays a `custom` rule with the
 * raw fields, so nothing is lost.
 */
import { emptyCalendarEntry, type CalendarEntryForm } from './agent-form'

export type ScheduleRule =
  | { kind: 'hourly'; minute: number }
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekly'; weekdays: number[]; hour: number; minute: number }
  | { kind: 'monthly'; day: number; hour: number; minute: number }
  | { kind: 'yearly'; month: number; day: number; hour: number; minute: number }
  | { kind: 'custom'; entry: CalendarEntryForm }

export type ScheduleKind = ScheduleRule['kind']

/** Monday first, as people read a week; 0 = Sunday (launchd also accepts 7). */
export const WEEK = [1, 2, 3, 4, 5, 6, 0] as const
export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]
export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

/** Present, plain integer fields of an entry; undefined when any field isn't a plain integer. */
function numbers(
  entry: CalendarEntryForm
): Partial<Record<keyof CalendarEntryForm, number>> | undefined {
  const out: Partial<Record<keyof CalendarEntryForm, number>> = {}
  for (const [key, raw] of Object.entries(entry) as [keyof CalendarEntryForm, string][]) {
    const t = raw.trim()
    if (t === '') continue
    if (!/^\d+$/.test(t)) return undefined
    out[key] = Number(t)
  }
  return out
}

const keysOf = (n: object): string => Object.keys(n).sort().join(',')
const inRange = (v: number, min: number, max: number): boolean => v >= min && v <= max
const validTime = (hour: number, minute: number): boolean =>
  inRange(hour, 0, 23) && inRange(minute, 0, 59)

function ruleOf(entry: CalendarEntryForm): ScheduleRule {
  const n = numbers(entry)
  const custom: ScheduleRule = { kind: 'custom', entry: { ...entry } }
  if (!n) return custom
  const { minute, hour, day, weekday, month } = n
  switch (keysOf(n)) {
    case 'minute':
      return inRange(minute!, 0, 59) ? { kind: 'hourly', minute: minute! } : custom
    case 'hour,minute':
      return validTime(hour!, minute!) ? { kind: 'daily', hour: hour!, minute: minute! } : custom
    case 'hour,minute,weekday':
      return validTime(hour!, minute!) && inRange(weekday!, 0, 7)
        ? { kind: 'weekly', weekdays: [weekday! % 7], hour: hour!, minute: minute! }
        : custom
    case 'day,hour,minute':
      return validTime(hour!, minute!) && inRange(day!, 1, 31)
        ? { kind: 'monthly', day: day!, hour: hour!, minute: minute! }
        : custom
    case 'day,hour,minute,month':
      return validTime(hour!, minute!) && inRange(day!, 1, 31) && inRange(month!, 1, 12)
        ? { kind: 'yearly', month: month!, day: day!, hour: hour!, minute: minute! }
        : custom
    default:
      return custom
  }
}

const sortWeek = (days: number[]): number[] =>
  [...new Set(days.map((d) => d % 7))].sort((a, b) => WEEK.indexOf(a as 0) - WEEK.indexOf(b as 0))

/** Calendar entries → rules; weekly entries at the same time become one rule. */
export function entriesToRules(entries: CalendarEntryForm[]): ScheduleRule[] {
  const rules: ScheduleRule[] = []
  for (const entry of entries) {
    const rule = ruleOf(entry)
    if (rule.kind === 'weekly') {
      const same = rules.find(
        (r): r is Extract<ScheduleRule, { kind: 'weekly' }> =>
          r.kind === 'weekly' && r.hour === rule.hour && r.minute === rule.minute
      )
      if (same) {
        same.weekdays = sortWeek([...same.weekdays, ...rule.weekdays])
        continue
      }
    }
    rules.push(rule)
  }
  return rules
}

const entry = (fields: Partial<Record<keyof CalendarEntryForm, number>>): CalendarEntryForm => {
  const e = emptyCalendarEntry()
  for (const [k, v] of Object.entries(fields)) e[k as keyof CalendarEntryForm] = String(v)
  return e
}

/** Rules → calendar entries, plus where each rule's entries start (for field errors). */
export function rulesToEntries(rules: ScheduleRule[]): {
  entries: CalendarEntryForm[]
  starts: number[]
} {
  const entries: CalendarEntryForm[] = []
  const starts: number[] = []
  for (const rule of rules) {
    starts.push(entries.length)
    switch (rule.kind) {
      case 'hourly':
        entries.push(entry({ minute: rule.minute }))
        break
      case 'daily':
        entries.push(entry({ hour: rule.hour, minute: rule.minute }))
        break
      case 'weekly':
        for (const weekday of sortWeek(rule.weekdays)) {
          entries.push(entry({ weekday, hour: rule.hour, minute: rule.minute }))
        }
        break
      case 'monthly':
        entries.push(entry({ day: rule.day, hour: rule.hour, minute: rule.minute }))
        break
      case 'yearly':
        entries.push(
          entry({ month: rule.month, day: rule.day, hour: rule.hour, minute: rule.minute })
        )
        break
      case 'custom':
        entries.push({ ...rule.entry })
        break
    }
  }
  return { entries, starts }
}

export const formatTime = (hour: number, minute: number): string =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

/** "HH:MM" from a time input → hour and minute; undefined when blank or malformed. */
export function parseTime(value: string): { hour: number; minute: number } | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return undefined
  const hour = Number(m[1])
  const minute = Number(m[2])
  return validTime(hour, minute) ? { hour, minute } : undefined
}

export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

function describeCustom(e: CalendarEntryForm): string {
  const n = numbers(e)
  if (!n) return 'on a custom schedule'
  if (Object.keys(n).length === 0) return 'every minute'
  const parts: string[] = []
  if (n.minute !== undefined) parts.push(`minute ${n.minute}`)
  else parts.push('every minute')
  if (n.hour !== undefined) parts.push(`of hour ${n.hour}`)
  if (n.weekday !== undefined)
    parts.push(`on ${WEEKDAY_NAMES[n.weekday % 7] ?? `weekday ${n.weekday}`}s`)
  if (n.day !== undefined)
    parts.push(`${n.weekday !== undefined ? 'or' : 'on'} the ${ordinal(n.day)}`)
  if (n.month !== undefined) parts.push(`in ${MONTH_NAMES[n.month - 1] ?? `month ${n.month}`}`)
  return parts.join(' ')
}

export function describeRule(rule: ScheduleRule): string {
  switch (rule.kind) {
    case 'hourly':
      return `every hour at :${String(rule.minute).padStart(2, '0')}`
    case 'daily':
      return `every day at ${formatTime(rule.hour, rule.minute)}`
    case 'weekly': {
      const days = sortWeek(rule.weekdays)
      const when =
        days.length === 7
          ? 'every day'
          : days.length === 0
            ? 'never (pick a day)'
            : `every ${joinWords(days.map((d) => WEEKDAY_NAMES[d]))}`
      return `${when} at ${formatTime(rule.hour, rule.minute)}`
    }
    case 'monthly':
      return `on the ${ordinal(rule.day)} of every month at ${formatTime(rule.hour, rule.minute)}`
    case 'yearly':
      return `every year on ${rule.day} ${MONTH_NAMES[rule.month - 1]} at ${formatTime(rule.hour, rule.minute)}`
    case 'custom':
      return describeCustom(rule.entry)
  }
}

/** "Runs every Monday at 13:30 and on the 7th of every month at 09:00." ('' when there are no rules) */
export function describeSchedule(rules: ScheduleRule[]): string {
  if (rules.length === 0) return ''
  return `Runs ${joinWords(rules.map(describeRule))}.`
}

/** A fresh rule of the given kind, keeping the time of `from` when it has one. */
export function newRule(kind: ScheduleKind, from?: ScheduleRule): ScheduleRule {
  const hour = from && 'hour' in from ? from.hour : 9
  const minute = from && 'minute' in from ? from.minute : 0
  switch (kind) {
    case 'hourly':
      return { kind, minute }
    case 'daily':
      return { kind, hour, minute }
    case 'weekly':
      return { kind, weekdays: [1], hour, minute }
    case 'monthly':
      return { kind, day: 1, hour, minute }
    case 'yearly':
      return { kind, month: 1, day: 1, hour, minute }
    case 'custom':
      return {
        kind,
        entry: from
          ? (rulesToEntries([from]).entries[0] ?? emptyCalendarEntry())
          : emptyCalendarEntry()
      }
  }
}
