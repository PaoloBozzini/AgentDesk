import { useState } from 'react'
import {
  CALENDAR_FIELDS,
  type CalendarEntryForm,
  type CalendarField,
  type FormErrors
} from '../../../shared/agent-form'
import {
  describeSchedule,
  entriesToRules,
  formatTime,
  MONTH_NAMES,
  newRule,
  parseTime,
  rulesToEntries,
  WEEK,
  WEEKDAY_NAMES,
  type ScheduleKind,
  type ScheduleRule
} from '../../../shared/schedule'

const KIND_LABELS: Record<ScheduleKind, string> = {
  hourly: 'Every hour',
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
  custom: 'Custom'
}

const CALENDAR_LABELS: Record<CalendarField, string> = {
  minute: 'Minute',
  hour: 'Hour',
  day: 'Day',
  weekday: 'Weekday',
  month: 'Month'
}

const sameEntries = (a: CalendarEntryForm[], b: CalendarEntryForm[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

function TimeInput({
  hour,
  minute,
  onChange
}: {
  hour: number
  minute: number
  onChange: (hour: number, minute: number) => void
}): React.JSX.Element {
  return (
    <label className="sched-inline">
      at
      <input
        type="time"
        value={formatTime(hour, minute)}
        onChange={(e) => {
          const t = parseTime(e.target.value)
          if (t) onChange(t.hour, t.minute)
        }}
      />
    </label>
  )
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}): React.JSX.Element {
  return (
    <label className="sched-inline">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isInteger(n) && n >= min && n <= max) onChange(n)
        }}
      />
    </label>
  )
}

/**
 * StartCalendarInterval as readable rules. Keeps its own rule list (so a rule
 * being edited doesn't jump around) and re-reads the entries when they change
 * from outside, e.g. after an XML edit.
 */
export function ScheduleEditor({
  entries,
  errors,
  onChange
}: {
  entries: CalendarEntryForm[]
  errors: FormErrors
  onChange: (entries: CalendarEntryForm[]) => void
}): React.JSX.Element {
  // `source`: the entries the rules were read from or last produced. Grouping can
  // reorder entries, so compare with that, not with what the rules produce now.
  const [state, setState] = useState(() => ({ rules: entriesToRules(entries), source: entries }))
  if (!sameEntries(state.source, entries)) {
    // changed elsewhere (XML, template): start over from the entries
    setState({ rules: entriesToRules(entries), source: entries })
  }
  const { rules } = state
  const { starts } = rulesToEntries(rules)

  const update = (next: ScheduleRule[]): void => {
    const out = rulesToEntries(next).entries
    setState({ rules: next, source: out })
    onChange(out)
  }
  const replace = (i: number, rule: ScheduleRule): void =>
    update(rules.map((r, j) => (j === i ? rule : r)))

  const summary = describeSchedule(rules)

  return (
    <div className="field">
      <span className="field-label">Schedule</span>
      {rules.map((rule, i) => {
        const ruleErrors = CALENDAR_FIELDS.map(
          (f) => errors[`startCalendarInterval.${starts[i]}.${f}`]
        ).filter(Boolean)
        return (
          <div className="sched-row" key={i}>
            <select
              aria-label={`Schedule ${i + 1} repeats`}
              value={rule.kind}
              onChange={(e) => replace(i, newRule(e.target.value as ScheduleKind, rule))}
            >
              {Object.entries(KIND_LABELS).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>

            {rule.kind === 'hourly' && (
              <NumberInput
                label="at minute"
                value={rule.minute}
                min={0}
                max={59}
                onChange={(minute) => replace(i, { ...rule, minute })}
              />
            )}

            {rule.kind === 'weekly' && (
              <div className="weekday-chips" role="group" aria-label="Days">
                {WEEK.map((d) => {
                  const on = rule.weekdays.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      className={on ? 'chip active' : 'chip'}
                      aria-pressed={on}
                      title={WEEKDAY_NAMES[d]}
                      onClick={() => {
                        const weekdays = on
                          ? rule.weekdays.filter((x) => x !== d)
                          : [...rule.weekdays, d]
                        // keep at least one day: a weekly rule with none would vanish
                        if (weekdays.length > 0) replace(i, { ...rule, weekdays })
                      }}
                    >
                      {WEEKDAY_NAMES[d].slice(0, 3)}
                    </button>
                  )
                })}
              </div>
            )}

            {rule.kind === 'monthly' && (
              <NumberInput
                label="on day"
                value={rule.day}
                min={1}
                max={31}
                onChange={(day) => replace(i, { ...rule, day })}
              />
            )}

            {rule.kind === 'yearly' && (
              <>
                <label className="sched-inline">
                  on
                  <select
                    aria-label="Month"
                    value={rule.month}
                    onChange={(e) => replace(i, { ...rule, month: Number(e.target.value) })}
                  >
                    {MONTH_NAMES.map((name, m) => (
                      <option key={name} value={m + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <NumberInput
                  label="day"
                  value={rule.day}
                  min={1}
                  max={31}
                  onChange={(day) => replace(i, { ...rule, day })}
                />
              </>
            )}

            {rule.kind !== 'hourly' && rule.kind !== 'custom' && (
              <TimeInput
                hour={rule.hour}
                minute={rule.minute}
                onChange={(hour, minute) => replace(i, { ...rule, hour, minute })}
              />
            )}

            {rule.kind === 'custom' && (
              <div className="calendar-row">
                {CALENDAR_FIELDS.map((f) => {
                  const error = errors[`startCalendarInterval.${starts[i]}.${f}`]
                  return (
                    <label key={f} className={error ? 'mini has-error' : 'mini'} title={error}>
                      <span>{CALENDAR_LABELS[f]}</span>
                      <input
                        inputMode="numeric"
                        placeholder="any"
                        value={rule.entry[f]}
                        aria-invalid={!!error}
                        onChange={(e) =>
                          replace(i, { ...rule, entry: { ...rule.entry, [f]: e.target.value } })
                        }
                      />
                    </label>
                  )
                })}
              </div>
            )}

            <button
              type="button"
              className="icon-button"
              aria-label={`Remove schedule ${i + 1}`}
              onClick={() => update(rules.filter((_, j) => j !== i))}
            >
              ✕
            </button>

            {rule.kind === 'monthly' && rule.day > 28 && (
              <p className="field-hint muted sched-note">
                Months without day {rule.day} are skipped.
              </p>
            )}
            {ruleErrors.length > 0 && <p className="field-error sched-note">{ruleErrors[0]}</p>}
          </div>
        )
      })}
      <button
        type="button"
        className="link-button"
        onClick={() => update([...rules, newRule(rules.length ? 'weekly' : 'daily')])}
      >
        + Add schedule
      </button>
      {summary && <p className="sched-summary">{summary}</p>}
    </div>
  )
}
