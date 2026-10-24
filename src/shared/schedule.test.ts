import { describe, expect, it } from 'vitest'
import { emptyCalendarEntry, formToPlist, plistToForm, type CalendarEntryForm } from './agent-form'
import type { PlistDict } from './plist-types'
import {
  describeSchedule,
  entriesToRules,
  newRule,
  ordinal,
  parseTime,
  rulesToEntries,
  type ScheduleRule
} from './schedule'

const e = (fields: Partial<CalendarEntryForm>): CalendarEntryForm => ({
  ...emptyCalendarEntry(),
  ...fields
})

/** Calendar of a plist → rules → back into the plist. */
function roundTrip(calendar: PlistDict['StartCalendarInterval']): PlistDict {
  const form = plistToForm({
    Label: 'com.t.a',
    Program: '/bin/true',
    StartCalendarInterval: calendar!
  })
  const { entries } = rulesToEntries(entriesToRules(form.startCalendarInterval))
  const result = formToPlist({ ...form, startCalendarInterval: entries })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.data
}

describe('entriesToRules', () => {
  it.each<[string, CalendarEntryForm[], ScheduleRule[]]>([
    ['hourly', [e({ minute: '15' })], [{ kind: 'hourly', minute: 15 }]],
    ['daily', [e({ hour: '9', minute: '0' })], [{ kind: 'daily', hour: 9, minute: 0 }]],
    [
      'weekly (rollbar-check: Monday 13:30)',
      [e({ weekday: '1', hour: '13', minute: '30' })],
      [{ kind: 'weekly', weekdays: [1], hour: 13, minute: 30 }]
    ],
    [
      'monthly (brew updater: 7th, 09:00)',
      [e({ day: '7', hour: '9', minute: '0' })],
      [{ kind: 'monthly', day: 7, hour: 9, minute: 0 }]
    ],
    [
      'yearly',
      [e({ month: '12', day: '24', hour: '18', minute: '5' })],
      [{ kind: 'yearly', month: 12, day: 24, hour: 18, minute: 5 }]
    ]
  ])('%s', (_n, entries, rules) => {
    expect(entriesToRules(entries)).toEqual(rules)
  })

  it('groups weekdays at the same time into one weekly rule, Monday first', () => {
    const entries = [
      e({ weekday: '4', hour: '9', minute: '0' }),
      e({ weekday: '7', hour: '9', minute: '0' }),
      e({ weekday: '1', hour: '9', minute: '0' }),
      e({ weekday: '2', hour: '18', minute: '0' })
    ]
    expect(entriesToRules(entries)).toEqual([
      { kind: 'weekly', weekdays: [1, 4, 0], hour: 9, minute: 0 },
      { kind: 'weekly', weekdays: [2], hour: 18, minute: 0 }
    ])
  })

  it.each<[string, Partial<CalendarEntryForm>]>([
    ['every minute', {}],
    ['hour without minute (every minute of that hour)', { hour: '9' }],
    ['day and weekday together', { day: '1', weekday: '1', hour: '9', minute: '0' }],
    ['month without day', { month: '6', hour: '9', minute: '0' }],
    ['out of range', { hour: '24', minute: '0' }],
    ['not a number', { hour: 'x', minute: '0' }]
  ])('keeps %s as custom', (_n, fields) => {
    expect(entriesToRules([e(fields)])).toEqual([{ kind: 'custom', entry: e(fields) }])
  })
})

describe('rulesToEntries', () => {
  it('expands a weekly rule to one entry per day and reports where each rule starts', () => {
    const { entries, starts } = rulesToEntries([
      { kind: 'daily', hour: 7, minute: 0 },
      { kind: 'weekly', weekdays: [4, 1], hour: 9, minute: 30 },
      { kind: 'custom', entry: e({ hour: 'x' }) }
    ])
    expect(entries).toEqual([
      e({ hour: '7', minute: '0' }),
      e({ weekday: '1', hour: '9', minute: '30' }),
      e({ weekday: '4', hour: '9', minute: '30' }),
      e({ hour: 'x' })
    ])
    expect(starts).toEqual([0, 1, 3])
  })
})

describe('round-trip through rules', () => {
  it.each<[string, PlistDict['StartCalendarInterval']]>([
    ['single dict', { Weekday: 1, Hour: 13, Minute: 30 }],
    ['monthly dict', { Day: 7, Hour: 9, Minute: 0 }],
    ['array', [{ Hour: 9, Minute: 0 }, { Minute: 15 }]],
    [
      'weekdays in week order',
      [
        { Weekday: 1, Hour: 9, Minute: 0 },
        { Weekday: 4, Hour: 9, Minute: 0 }
      ]
    ],
    ['custom', [{ Hour: 9 }, { Day: 1, Weekday: 1, Hour: 0, Minute: 0 }]],
    ['every minute', [{}]]
  ])('%s is unchanged', (_n, calendar) => {
    expect(roundTrip(calendar).StartCalendarInterval).toEqual(calendar)
  })
})

describe('describeSchedule', () => {
  it.each<[ScheduleRule[], string]>([
    [[], ''],
    [[{ kind: 'hourly', minute: 5 }], 'Runs every hour at :05.'],
    [[{ kind: 'daily', hour: 9, minute: 0 }], 'Runs every day at 09:00.'],
    [
      [{ kind: 'weekly', weekdays: [4, 1], hour: 13, minute: 30 }],
      'Runs every Monday and Thursday at 13:30.'
    ],
    [
      [{ kind: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 0], hour: 8, minute: 0 }],
      'Runs every day at 08:00.'
    ],
    [
      [
        { kind: 'weekly', weekdays: [1], hour: 13, minute: 30 },
        { kind: 'monthly', day: 7, hour: 9, minute: 0 }
      ],
      'Runs every Monday at 13:30 and on the 7th of every month at 09:00.'
    ],
    [
      [{ kind: 'yearly', month: 12, day: 24, hour: 18, minute: 0 }],
      'Runs every year on 24 December at 18:00.'
    ],
    [[{ kind: 'custom', entry: e({}) }], 'Runs every minute.'],
    [[{ kind: 'custom', entry: e({ hour: '9' }) }], 'Runs every minute of hour 9.'],
    [
      [{ kind: 'custom', entry: e({ minute: '0', day: '1', weekday: '1' }) }],
      'Runs minute 0 on Mondays or the 1st.'
    ]
  ])('%j', (rules, text) => {
    expect(describeSchedule(rules)).toBe(text)
  })
})

describe('helpers', () => {
  it('ordinal', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '31st'
    ])
  })

  it('parseTime', () => {
    expect(parseTime('09:05')).toEqual({ hour: 9, minute: 5 })
    expect(parseTime('9:05')).toEqual({ hour: 9, minute: 5 })
    expect(parseTime('24:00')).toBeUndefined()
    expect(parseTime('')).toBeUndefined()
  })

  it('newRule keeps the time when changing kind', () => {
    const from: ScheduleRule = { kind: 'daily', hour: 13, minute: 30 }
    expect(newRule('weekly', from)).toEqual({ kind: 'weekly', weekdays: [1], hour: 13, minute: 30 })
    expect(newRule('custom', from)).toEqual({
      kind: 'custom',
      entry: e({ hour: '13', minute: '30' })
    })
    expect(newRule('hourly')).toEqual({ kind: 'hourly', minute: 0 })
  })
})
