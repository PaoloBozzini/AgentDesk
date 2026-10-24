import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { build } from 'plist'
import { describe, expect, it } from 'vitest'
import { SCRIPT_PATH, SCRIPT_STUB } from './agent-defaults'
import { formToPlist, plistToForm } from './agent-form'
import { AGENT_TEMPLATES, getTemplate, type TemplateId } from './agent-templates'

const ctx = { home: '/Users/tester' }

function plistFor(id: TemplateId): Record<string, unknown> {
  const form = getTemplate(id).build(ctx)
  // a template plus a label is a complete agent
  form.label = 'com.tester.example'
  const result = formToPlist(form)
  if (!result.ok) throw new Error(`invalid: ${JSON.stringify(result.errors)}`)
  return result.data
}

describe('agent templates', () => {
  it('has the five templates with unique ids', () => {
    expect(AGENT_TEMPLATES.map((t) => t.id)).toEqual([
      'run-at-login',
      'interval',
      'schedule',
      'watch-path',
      'keep-alive'
    ])
  })

  it.each(AGENT_TEMPLATES.map((t) => t.id))('%s produces a valid plist that round-trips', (id) => {
    const data = plistFor(id)
    expect(data.Label).toBe('com.tester.example')
    expect(data.ProgramArguments).toEqual(['/bin/zsh', '-c', SCRIPT_STUB])
    expect(data.EnvironmentVariables).toEqual({ PATH: SCRIPT_PATH })
    expect(build(data as Parameters<typeof build>[0])).toContain('<plist')
    const again = formToPlist(plistToForm(data as never))
    expect(again).toEqual({ ok: true, data })
  })

  it.runIf(process.platform === 'darwin').each(AGENT_TEMPLATES.map((t) => t.id))(
    '%s passes plutil -lint',
    (id) => {
      const dir = mkdtempSync(join(tmpdir(), 'agentdesk-tpl-'))
      try {
        const file = join(dir, 'agent.plist')
        writeFileSync(file, build(plistFor(id) as Parameters<typeof build>[0]))
        expect(execFileSync('/usr/bin/plutil', ['-lint', file], { encoding: 'utf8' })).toMatch(/OK/)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it('sets the expected trigger keys', () => {
    expect(plistFor('run-at-login')).toMatchObject({ RunAtLoad: true })
    expect(plistFor('interval')).toMatchObject({ StartInterval: 900 })
    expect(plistFor('schedule')).toMatchObject({ StartCalendarInterval: { Hour: 9, Minute: 0 } })
    expect(plistFor('watch-path')).toMatchObject({ WatchPaths: ['/Users/tester/Downloads'] })
    expect(plistFor('keep-alive')).toMatchObject({ RunAtLoad: true, KeepAlive: true })
  })

  it('only sets trigger keys', () => {
    const triggers = [
      'RunAtLoad',
      'StartInterval',
      'StartCalendarInterval',
      'WatchPaths',
      'KeepAlive'
    ]
    for (const { id } of AGENT_TEMPLATES) {
      const extraKeys = Object.keys(plistFor(id)).filter(
        (k) => !['Label', 'ProgramArguments', 'EnvironmentVariables', ...triggers].includes(k)
      )
      expect(extraKeys, id).toEqual([])
    }
  })

  it('returns a fresh form each time', () => {
    const a = getTemplate('keep-alive').build(ctx)
    a.keepAlive.mode = 'never'
    expect(getTemplate('keep-alive').build(ctx).keepAlive.mode).toBe('always')
  })

  it('handles a home with a trailing slash', () => {
    expect(getTemplate('watch-path').build({ home: '/Users/t/' }).watchPaths).toEqual([
      '/Users/t/Downloads'
    ])
  })

  it('throws on an unknown id', () => {
    expect(() => getTemplate('nope' as TemplateId)).toThrow('Unknown template')
  })
})
