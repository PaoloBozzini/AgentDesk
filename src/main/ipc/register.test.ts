/**
 * IPC audit (#35): every channel has a handler, refuses untrusted senders, and
 * survives hostile arguments without touching anything outside the sandbox.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { IpcChannel } from '../../shared/ipc-contract'

const env = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync } = require('fs') as typeof import('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('os') as typeof import('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('path') as typeof import('path')
  const base = mkdtempSync(join(tmpdir(), 'agentdesk-ipc-'))
  return {
    base,
    home: join(base, 'home'),
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    shell: {
      openPath: undefined as unknown as ReturnType<typeof vi.fn>,
      trashItem: undefined as unknown as ReturnType<typeof vi.fn>,
      openExternal: undefined as unknown as ReturnType<typeof vi.fn>
    },
    clipboard: { writeText: undefined as unknown as ReturnType<typeof vi.fn> }
  }
})

vi.mock('os', async (importOriginal) => {
  const real = await importOriginal<typeof import('os')>()
  return { ...real, homedir: () => env.home, default: { ...real, homedir: () => env.home } }
})

vi.mock('electron', () => {
  env.shell.openPath = vi.fn(async () => '')
  env.shell.trashItem = vi.fn(async () => {})
  env.shell.openExternal = vi.fn(async () => {})
  env.clipboard.writeText = vi.fn()
  return {
    app: { getName: () => 'Agent Desk', getVersion: () => '0.0.0-test', isPackaged: false },
    clipboard: env.clipboard,
    shell: env.shell,
    BrowserWindow: { fromWebContents: () => null },
    dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
    ipcMain: {
      handle: (channel: string, fn: (...args: unknown[]) => unknown) =>
        env.handlers.set(channel, fn)
    }
  }
})

const { registerIpcHandlers } = await import('./register')

const agentsDir = join(env.home, 'Library', 'LaunchAgents')
const canaryDir = join(env.base, 'canary')
const canaryFile = join(canaryDir, 'victim.plist')
const CANARY = 'do not touch'

function sender(id = 1): Record<string, unknown> {
  return {
    id,
    isDestroyed: () => false,
    send: vi.fn(),
    once: vi.fn(),
    on: vi.fn()
  }
}

const trustedUrl = pathToFileURL(join(__dirname, '../renderer/index.html')).href
const event = (url = trustedUrl): unknown => ({ senderFrame: { url }, sender: sender() })

const call = async (channel: string, args: unknown[], url?: string): Promise<unknown> =>
  env.handlers.get(channel)!(event(url), ...args)

/** Run a handler; hostile input may reject or return a failure, never crash the process. */
const settle = async (channel: string, args: unknown[]): Promise<unknown> => {
  try {
    return await call(channel, args)
  } catch (e) {
    return { rejected: (e as Error).message }
  }
}

const HOSTILE: unknown[] = [
  undefined,
  null,
  42,
  NaN,
  '',
  'x',
  '/etc/passwd',
  '../../../etc/hosts',
  `${agentsDir}/../../../canary/victim.plist`,
  canaryFile,
  join(agentsDir, '.hidden.plist'),
  join(agentsDir, 'x\0.plist'),
  {},
  [],
  { xml: 1 },
  { data: 'x' },
  { data: { Label: 'com.evil.x', Program: '/bin/sh', StandardOutPath: join(canaryDir, 'o', 'x') } },
  { data: { Label: '../../canary/x', Program: '/bin/sh' } },
  { xml: `<plist><dict><key>Label</key><string>../canary</string></dict></plist>` },
  JSON.parse('{"__proto__": {"polluted": true}}'),
  { includeSystem: 'true' },
  { load: 'yes' },
  { baseHash: 1 }
]

beforeAll(() => {
  mkdirSync(agentsDir, { recursive: true })
  mkdirSync(join(env.home, 'Library', 'Application Support'), { recursive: true })
  mkdirSync(canaryDir)
  writeFileSync(canaryFile, CANARY)
  registerIpcHandlers()
})

afterAll(() => {
  rmSync(env.base, { recursive: true, force: true })
})

describe('IPC handlers', () => {
  it('every channel in the contract has a handler', () => {
    expect([...env.handlers.keys()].sort()).toEqual(Object.values(IpcChannel).sort())
  })

  it('trusted calls run against the sandbox home', async () => {
    expect(await call(IpcChannel.AppGetInfo, [])).toMatchObject({ home: env.home })
    const list = (await call(IpcChannel.AgentsList, [{}])) as { agents: unknown[] }
    expect(list.agents).toEqual([])
    const lint = await call(IpcChannel.AgentsLint, ['<plist version="1.0"><dict/></plist>'])
    expect(lint).toMatchObject({ ok: true })
    const converted = await call(IpcChannel.PlistConvert, [{ data: { A: 1 } }])
    expect(converted).toMatchObject({ ok: true, data: { A: 1 } })
  })

  it.each(Object.values(IpcChannel))('%s refuses untrusted senders', async (channel) => {
    for (const url of ['https://evil.example/', 'file:///tmp/evil.html', '', 'devtools://x']) {
      await expect(call(channel, ['x'], url)).rejects.toThrow(/untrusted sender/)
    }
  })

  it.each(Object.values(IpcChannel).filter((c) => c !== IpcChannel.AgentsList))(
    '%s survives hostile arguments',
    async (channel) => {
      for (const a of HOSTILE) {
        for (const b of [undefined, ...HOSTILE.slice(0, 6), 'stdout', '1h']) {
          const result = await settle(channel, [a, b, a])
          // nothing of the input may leak into the prototype chain
          expect(({} as Record<string, unknown>).polluted).toBeUndefined()
          void result
        }
      }
      expect(readFileSync(canaryFile, 'utf8')).toBe(CANARY)
      expect(readdirSync(canaryDir)).toEqual(['victim.plist'])
      expect(env.shell.trashItem).not.toHaveBeenCalled()
      expect(env.shell.openExternal).not.toHaveBeenCalled()
    },
    60_000
  )

  it('write channels refuse paths outside the user agents folder', async () => {
    for (const p of [canaryFile, '/etc/hosts', `${agentsDir}/../../../canary/victim.plist`]) {
      expect(
        await settle(IpcChannel.AgentsSave, [p, { data: {} }, { baseHash: 'x' }])
      ).toMatchObject({ ok: false })
      expect(await settle(IpcChannel.AgentsDelete, [p])).toMatchObject({ ok: false })
      expect(await settle(IpcChannel.AgentsControl, [p, 'unload'])).toMatchObject({ ok: false })
    }
    expect(readFileSync(canaryFile, 'utf8')).toBe(CANARY)
  })

  it('copyText only takes bounded strings', async () => {
    await expect(call(IpcChannel.AppCopyText, [{ toString: () => 'x' }])).rejects.toThrow()
    await expect(call(IpcChannel.AppCopyText, ['x'.repeat(1_000_001)])).rejects.toThrow()
    await call(IpcChannel.AppCopyText, ['ok'])
    expect(env.clipboard.writeText).toHaveBeenCalledTimes(1)
  })

  it('nothing was created outside the sandbox home', () => {
    expect(readdirSync(env.base).sort()).toEqual(['canary', 'home'])
    // the hostile create inputs wrote nothing into LaunchAgents
    expect(readdirSync(agentsDir)).toEqual([])
  })
})
