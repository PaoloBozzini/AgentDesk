import { chmod, mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AgentPathError,
  agentDirsFor,
  listAgents,
  readAgent,
  resolveAgentFile,
  summarize,
  userAgentsDir
} from './agents'
import { serializePlist } from './plist'

describe('summarize', () => {
  it('extracts label and program arguments', () => {
    const s = summarize('/p/com.a.b.plist', 'com.a.b.plist', 'user', {
      Label: 'com.a.b',
      ProgramArguments: ['/bin/echo', 'hi']
    })
    expect(s).toMatchObject({
      label: 'com.a.b',
      programArguments: ['/bin/echo', 'hi'],
      program: undefined,
      labelMismatch: false,
      readOnly: false
    })
  })

  it('flags filename/label mismatch', () => {
    expect(summarize('/p/x.plist', 'x.plist', 'user', { Label: 'com.a.b' }).labelMismatch).toBe(
      true
    )
  })

  it('ignores wrongly typed keys', () => {
    const s = summarize('/p/x.plist', 'x.plist', 'user', {
      Label: 1,
      Program: ['no'],
      ProgramArguments: ['ok', 2]
    })
    expect(s.label).toBeUndefined()
    expect(s.program).toBeUndefined()
    expect(s.programArguments).toBeUndefined()
    expect(s.labelMismatch).toBe(false)
  })

  it('marks system scopes read-only', () => {
    expect(summarize('/p', 'p', 'global-daemon', {}).readOnly).toBe(true)
  })
})

describe('listAgents', () => {
  let base: string
  let dir: string

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'agentdesk-list-'))
    dir = userAgentsDir(base)
    await mkdir(dir, { recursive: true })
  })

  afterEach(async () => {
    await chmod(join(dir, 'locked.plist'), 0o644).catch(() => {})
    await rm(base, { recursive: true, force: true })
  })

  it('lists plists sorted by label, with errors for broken files', async () => {
    await writeFile(
      join(dir, 'com.z.plist'),
      serializePlist({ Label: 'com.z', Program: '/bin/true' })
    )
    await writeFile(
      join(dir, 'com.a.plist'),
      serializePlist({ Label: 'com.a', ProgramArguments: ['/bin/ls'] })
    )
    await writeFile(join(dir, 'broken.plist'), '<plist><dict>')
    await writeFile(join(dir, 'notes.txt'), 'ignored')
    await writeFile(join(dir, '.hidden.plist'), 'ignored')

    const agents = await listAgents([{ dir, scope: 'user' }])
    expect(agents.map((a) => a.label ?? a.fileName)).toEqual(['broken.plist', 'com.a', 'com.z'])
    expect(agents[0].error).toMatch(/Malformed/)
    expect(agents[1].format).toBe('xml')
  })

  it('reports unreadable files instead of failing', async () => {
    const file = join(dir, 'locked.plist')
    await writeFile(file, serializePlist({ Label: 'locked' }))
    await chmod(file, 0o000)
    const [agent] = await listAgents([{ dir, scope: 'user' }])
    expect(agent.error).toMatch(/EACCES/)
  })

  it('returns an empty list when the folder is missing', async () => {
    await expect(listAgents([{ dir: join(base, 'nope'), scope: 'user' }])).resolves.toEqual([])
  })
})

describe('resolveAgentFile', () => {
  const dirs = [
    { dir: '/Users/x/Library/LaunchAgents', scope: 'user' as const },
    { dir: '/Library/LaunchDaemons', scope: 'global-daemon' as const }
  ]

  it('accepts a plist directly inside a known folder', () => {
    expect(resolveAgentFile('/Users/x/Library/LaunchAgents/com.a.plist', dirs)).toMatchObject({
      scope: 'user',
      path: '/Users/x/Library/LaunchAgents/com.a.plist'
    })
    expect(resolveAgentFile('/Library/LaunchDaemons/com.a.plist', dirs).scope).toBe('global-daemon')
  })

  it.each([
    ['traversal', '/Users/x/Library/LaunchAgents/../../.ssh/id_rsa.plist'],
    ['nested', '/Users/x/Library/LaunchAgents/sub/com.a.plist'],
    ['other folder', '/etc/com.a.plist'],
    ['not a plist', '/Users/x/Library/LaunchAgents/notes.txt'],
    ['hidden', '/Users/x/Library/LaunchAgents/.x.plist'],
    ['relative', 'Library/LaunchAgents/com.a.plist'],
    ['NUL', '/Users/x/Library/LaunchAgents/a\0.plist'],
    ['non-string', 42]
  ])('rejects %s', (_n, p) => {
    expect(() => resolveAgentFile(p, dirs)).toThrow(AgentPathError)
  })
})

describe('readAgent', () => {
  it('returns summary, data and original xml', async () => {
    const base = await mkdtemp(join(tmpdir(), 'agentdesk-read-'))
    const dir = userAgentsDir(base)
    await mkdir(dir, { recursive: true })
    const xml = serializePlist({ Label: 'com.a', RunAtLoad: true })
    await writeFile(join(dir, 'com.a.plist'), xml)
    const detail = await readAgent(join(dir, 'com.a.plist'), [{ dir, scope: 'user' }])
    expect(detail.summary.label).toBe('com.a')
    expect(detail.data.RunAtLoad).toBe(true)
    expect(detail.xml).toBe(xml)
    await rm(base, { recursive: true, force: true })
  })
})

describe('agentDirsFor', () => {
  it('defaults to the user folder only', () => {
    expect(agentDirsFor(undefined, '/Users/x')).toEqual([
      { dir: '/Users/x/Library/LaunchAgents', scope: 'user' }
    ])
  })

  it('adds system folders only for a strict true', () => {
    expect(agentDirsFor({ includeSystem: true }, '/Users/x').map((d) => d.scope)).toEqual([
      'user',
      'global-agent',
      'global-daemon'
    ])
    for (const bad of [{ includeSystem: 'true' }, { includeSystem: 1 }, 'x', null]) {
      expect(agentDirsFor(bad, '/Users/x')).toHaveLength(1)
    }
  })
})
