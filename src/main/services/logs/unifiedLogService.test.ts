import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LogEvent } from '../../../shared/log-types'
import { userAgentsDir, type AgentDir } from '../agents'
import { serializePlist } from '../plist'
import { isAlive, ProcessRegistry, spawnTracked, type TrackedChild } from '../processes'
import { MAX_LINES, startUnifiedLog, type UnifiedLogDeps } from './unifiedLogService'

let base: string
let dirs: AgentDir[]
let agentFile: string
let events: LogEvent[]
let registry: ProcessRegistry
let spawned: { file: string; args: string[]; child: TrackedChild }[]

const logEvent = (i: number): string =>
  JSON.stringify({
    eventType: 'logEvent',
    eventMessage: `msg ${i}`,
    processImagePath: '/bin/x',
    messageType: 'Default'
  })

/** Stand-in for /usr/bin/log: a Node child that prints the given script's output. */
const fakeLog =
  (script: string): UnifiedLogDeps['spawn'] =>
  (file, args) => {
    const child = spawnTracked(process.execPath, ['-e', script])
    spawned.push({ file, args, child })
    return child
  }

const deps = (spawn: UnifiedLogDeps['spawn']): UnifiedLogDeps => ({
  dirs,
  registry,
  owner: 1,
  send: (e) => events.push(e),
  spawn
})

const waitForEnd = async (): Promise<Extract<LogEvent, { kind: 'end' }>> => {
  const deadline = Date.now() + 5000
  for (;;) {
    const end = events.find((e) => e.kind === 'end')
    if (end) return end as Extract<LogEvent, { kind: 'end' }>
    if (Date.now() > deadline) throw new Error('no end event')
    await new Promise((r) => setTimeout(r, 20))
  }
}

const allLines = (): string[] =>
  events.flatMap((e) => (e.kind === 'lines' ? e.lines.map((l) => l.message) : []))

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'agentdesk-ulog-'))
  const dir = userAgentsDir(base)
  await mkdir(dir, { recursive: true })
  dirs = [{ dir, scope: 'user' }]
  agentFile = join(dir, 'com.a.b.plist')
  await writeFile(
    agentFile,
    serializePlist({ Label: 'com.a.b', ProgramArguments: ['/usr/local/bin/tool'] })
  )
  events = []
  registry = new ProcessRegistry()
  spawned = []
})

afterEach(async () => {
  registry.disposeAll()
  await rm(base, { recursive: true, force: true })
})

describe('startUnifiedLog', () => {
  it('show: one /usr/bin/log process per predicate part, merged by time', async () => {
    const ev = (t: string, m: string): string =>
      JSON.stringify({
        eventType: 'logEvent',
        eventMessage: m,
        timestamp: t,
        processImagePath: '/x/p'
      })
    // The fake prints different lines depending on which predicate it was given
    const spawn: UnifiedLogDeps['spawn'] = (file, args) => {
      const launchd = args.at(-1)!.includes('launchd')
      const lines = launchd
        ? [ev('2026-10-23 10:00:02.000000+0200', 'launchd 1'), '{"count":1,"finished":1}']
        : [
            ev('2026-10-23 10:00:01.000000+0200', 'tool 1'),
            '{"eventType":"activityCreateEvent"}',
            ev('2026-10-23 10:00:03.000000+0200', 'tool 2')
          ]
      return fakeLog(`process.stdout.write(${JSON.stringify(lines.join('\n') + '\n')})`)!(
        file,
        args
      )
    }
    const r = await startUnifiedLog(agentFile, { kind: 'show', window: '1h' }, deps(spawn))
    expect(r).toEqual({
      ok: true,
      id: expect.any(String),
      predicate: '(process == "launchd" AND eventMessage CONTAINS "com.a.b") OR process == "tool"',
      note: 'Also shows anything logged by processes named “tool”.'
    })
    expect(spawned.map((s) => s.file)).toEqual(['/usr/bin/log', '/usr/bin/log'])
    expect(spawned.map((s) => s.args.slice(0, 5))).toEqual([
      ['show', '--last', '1h', '--style', 'ndjson'],
      ['show', '--last', '1h', '--style', 'ndjson']
    ])
    expect(spawned.map((s) => s.args[6])).toEqual([
      '(process == "launchd" AND eventMessage CONTAINS "com.a.b")',
      'process == "tool"'
    ])
    const end = await waitForEnd()
    // Parts arrive separately (the renderer merges); together they hold every line
    expect([...allLines()].sort()).toEqual(['launchd 1', 'tool 1', 'tool 2'])
    expect(events.filter((e) => e.kind === 'progress')).toEqual([
      { id: expect.any(String), kind: 'progress', done: 1, total: 2 },
      { id: expect.any(String), kind: 'progress', done: 2, total: 2 }
    ])
    expect(end).toMatchObject({ count: 3, truncated: false, error: undefined })
    expect(registry.size).toBe(0)
  })

  it('reassembles lines split across stdout chunks', async () => {
    const line = logEvent(7)
    const script = `process.stdout.write(${JSON.stringify(line.slice(0, 10))});setTimeout(()=>process.stdout.write(${JSON.stringify(line.slice(10) + '\n')}),50)`
    await startUnifiedLog(agentFile, { kind: 'stream' }, deps(fakeLog(script)))
    await waitForEnd()
    expect(allLines()).toEqual(['msg 7'])
  })

  it('reports stderr when log fails (e.g. bad predicate)', async () => {
    const script = `process.stderr.write("log: Invalid predicate\\n");process.exit(64)`
    await startUnifiedLog(agentFile, { kind: 'show', window: '15m' }, deps(fakeLog(script)))
    const end = await waitForEnd()
    expect(end.error).toContain('log: Invalid predicate')
    expect(end.count).toBe(0)
  })

  it('caps output and kills the process', async () => {
    const script = `const l=${JSON.stringify(logEvent(0))}+"\\n";const w=()=>{while(process.stdout.write(l.repeat(500)));process.stdout.once("drain",w)};w()`
    await startUnifiedLog(agentFile, { kind: 'show', window: '24h' }, deps(fakeLog(script)))
    const end = await waitForEnd()
    // each part is capped at MAX_LINES and its process killed
    expect(end).toMatchObject({ truncated: true, count: 2 * MAX_LINES, error: undefined })
    expect(allLines()).toHaveLength(2 * MAX_LINES)
    await new Promise((r) => setTimeout(r, 100))
    expect(spawned.every((s) => !isAlive(s.child.pid))).toBe(true)
  })

  it('stream mode: runs until disposed, then the child is killed', async () => {
    const script = `setInterval(()=>console.log(${JSON.stringify(logEvent(1))}),20)`
    const r = await startUnifiedLog(agentFile, { kind: 'stream' }, deps(fakeLog(script)))
    expect(spawned[0].args.slice(0, 3)).toEqual(['stream', '--style', 'ndjson'])
    await new Promise((res) => setTimeout(res, 250))
    expect(allLines().length).toBeGreaterThan(0)
    registry.dispose((r as { id: string }).id)
    await waitForEnd()
    expect(isAlive(spawned[0].child.pid)).toBe(false)
  })

  it('notes when the program is a generic interpreter', async () => {
    await writeFile(
      agentFile,
      serializePlist({ Label: 'com.a.b', ProgramArguments: ['/bin/sh', '-c', 'x'] })
    )
    const r = await startUnifiedLog(agentFile, { kind: 'show', window: '15m' }, deps(fakeLog('')))
    expect(r).toMatchObject({
      ok: true,
      predicate: '(process == "launchd" AND eventMessage CONTAINS "com.a.b")'
    })
    expect((r as { note?: string }).note).toMatch(/sh/)
  })

  it('refuses bad agent paths and label-less plists without spawning', async () => {
    expect(
      await startUnifiedLog('/etc/passwd', { kind: 'stream' }, deps(fakeLog('')))
    ).toMatchObject({ ok: false })
    await writeFile(agentFile, serializePlist({ Program: '/x' }))
    expect(await startUnifiedLog(agentFile, { kind: 'stream' }, deps(fakeLog('')))).toMatchObject({
      ok: false,
      message: 'The plist has no valid Label'
    })
    expect(spawned).toEqual([])
  })
})
