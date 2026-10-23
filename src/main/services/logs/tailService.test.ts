import { appendFile, mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LogEvent } from '../../../shared/log-types'
import { userAgentsDir, type AgentDir } from '../agents'
import { serializePlist } from '../plist'
import { ProcessRegistry } from '../processes'
import { startFileTail } from './tailService'

let base: string
let dirs: AgentDir[]
let agentFile: string
let logFile: string
let events: LogEvent[]
let registry: ProcessRegistry

const deps = (): Parameters<typeof startFileTail>[2] => ({
  dirs,
  registry,
  owner: 1,
  send: (e) => events.push(e),
  pollMs: 20
})

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'agentdesk-tailsvc-'))
  const dir = userAgentsDir(base)
  await mkdir(dir, { recursive: true })
  dirs = [{ dir, scope: 'user' }]
  logFile = join(base, 'out.log')
  agentFile = join(dir, 'com.a.plist')
  await writeFile(
    agentFile,
    serializePlist({ Label: 'com.a', StandardOutPath: logFile, StandardErrorPath: 'rel.log' })
  )
  events = []
  registry = new ProcessRegistry()
})

afterEach(async () => {
  registry.disposeAll()
  await rm(base, { recursive: true, force: true })
})

describe('startFileTail', () => {
  it('tails the path from the plist and tags events with the subscription id', async () => {
    await writeFile(logFile, 'hello\n')
    const r = await startFileTail(agentFile, 'stdout', deps())
    expect(r).toMatchObject({ ok: true, path: logFile })
    const id = (r as { id: string }).id
    await appendFile(logFile, 'more\n')
    await new Promise((res) => setTimeout(res, 100))
    expect(events.every((e) => e.id === id)).toBe(true)
    expect(events.find((e) => e.kind === 'reset')).toMatchObject({ text: 'hello\n' })
    expect(events.find((e) => e.kind === 'append')).toMatchObject({ text: 'more\n' })
  })

  it('stops tailing when the subscription is disposed', async () => {
    await writeFile(logFile, '')
    const r = await startFileTail(agentFile, 'stdout', deps())
    registry.dispose((r as { id: string }).id)
    events = []
    await appendFile(logFile, 'late\n')
    await new Promise((res) => setTimeout(res, 100))
    expect(events).toEqual([])
  })

  it('reports keys that are not set or relative', async () => {
    await writeFile(agentFile, serializePlist({ Label: 'com.a', StandardErrorPath: 'rel.log' }))
    expect(await startFileTail(agentFile, 'stdout', deps())).toMatchObject({
      ok: false,
      reason: 'not-set'
    })
    expect(await startFileTail(agentFile, 'stderr', deps())).toMatchObject({
      ok: false,
      reason: 'relative-path'
    })
    expect(registry.size).toBe(0)
  })

  it('rejects agent paths outside the agent folders', async () => {
    expect(await startFileTail('/etc/passwd', 'stdout', deps())).toMatchObject({
      ok: false,
      reason: 'error'
    })
  })
})
