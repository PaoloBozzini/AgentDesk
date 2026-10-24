/** examples/: every example agent installs, lints and passes the editor's validation. */
import { execFileSync, spawnSync } from 'child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs'
import { tmpdir, userInfo } from 'os'
import { join } from 'path'
import { parse } from 'plist'
import { afterAll, describe, expect, it } from 'vitest'
import { plistToForm, validateAgentForm } from './agent-form'
import { isValidLabel } from './label'
import type { PlistDict } from './plist-types'

const EXAMPLES = join(__dirname, '../../examples')
const names = readdirSync(EXAMPLES, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const fill = (text: string, home: string, user: string): string =>
  text.replaceAll('__HOME__', home).replaceAll('__USER__', user)

describe('examples', () => {
  it('has the documented set', () => {
    expect(names.sort()).toEqual([
      'brew-update',
      'disk-space-alert',
      'documents-backup',
      'downloads-cleanup',
      'inbox-watcher',
      'local-web-server'
    ])
  })

  it.each(names)('%s: plist is a valid agent once filled in', (name) => {
    const raw = readFileSync(join(EXAMPLES, name, 'agent.plist'), 'utf8')
    const data = parse(fill(raw, '/Users/test', 'test')) as PlistDict
    expect(data.Label).toBe(`com.test.${name}`)
    expect(isValidLabel(data.Label)).toBe(true)
    expect(validateAgentForm(plistToForm(data))).toEqual({})
    expect(data.ProgramArguments).toEqual([
      '/bin/zsh',
      `/Users/test/Library/Scripts/AgentDesk/${name}.sh`
    ])
    expect(statSync(join(EXAMPLES, name, `${name}.sh`)).mode & 0o111).toBeTruthy()
  })

  it.each(names)('%s: script parses', (name) => {
    expect(() => execFileSync('/bin/zsh', ['-n', join(EXAMPLES, name, `${name}.sh`)])).not.toThrow()
  })
})

describe.runIf(process.platform === 'darwin')('examples/install.sh', () => {
  const home = mkdtempSync(join(tmpdir(), 'agentdesk-examples-'))
  const user = userInfo()
    .username.toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
  const install = (...args: string[]): ReturnType<typeof spawnSync> =>
    spawnSync('/bin/bash', [join(EXAMPLES, 'install.sh'), ...args], {
      env: { ...process.env, HOME: home },
      encoding: 'utf8'
    })

  afterAll(() => rmSync(home, { recursive: true, force: true }))

  it.each(names)('%s installs into ~/Library with the home filled in', (name) => {
    const result = install(name)
    expect(result.status, String(result.stderr)).toBe(0)
    const label = `com.${user}.${name}`
    const plistPath = join(home, 'Library/LaunchAgents', `${label}.plist`)
    const text = readFileSync(plistPath, 'utf8')
    expect(text).not.toMatch(/__HOME__|__USER__/)
    const data = parse(text) as PlistDict
    expect(data.Label).toBe(label)
    expect(validateAgentForm(plistToForm(data))).toEqual({})
    expect(data.StandardOutPath).toBe(join(home, 'Library/Logs', label, 'stdout.log'))
    const script = join(home, 'Library/Scripts/AgentDesk', `${name}.sh`)
    expect(statSync(script).mode & 0o777).toBe(0o755)
    expect(statSync(join(home, 'Library/Logs', label)).isDirectory()).toBe(true)
    if (typeof data.WorkingDirectory === 'string') {
      expect(statSync(data.WorkingDirectory).isDirectory()).toBe(true)
    }
  })

  it('never overwrites an installed example', () => {
    const result = install('brew-update')
    expect(result.status).toBe(1)
    expect(String(result.stderr)).toMatch(/Already exists/)
  })

  it.each([[], ['nope'], ['../etc'], ['brew-update', '--force']])(
    'rejects bad usage %j',
    (...args) => {
      expect(install(...(args as string[])).status).toBe(1)
    }
  )
})
