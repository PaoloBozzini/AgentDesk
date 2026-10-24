import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentDir } from './agents'
import { serializePlist } from './plist'
import { MAX_SCRIPT_BYTES, readAgentScriptFile } from './scriptFile'

let base: string
let agentsDir: string
let dirs: AgentDir[]
let plist: string
let script: string

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'agentdesk-scriptfile-'))
  agentsDir = join(base, 'LaunchAgents')
  await mkdir(agentsDir)
  dirs = [{ dir: agentsDir, scope: 'user' }]
  script = join(base, 'brew_update.sh')
  await writeFile(script, '#!/bin/zsh\nbrew update\n')
  plist = join(agentsDir, 'com.t.brew.plist')
  await writeFile(plist, serializePlist({ Label: 'com.t.brew', Program: script }))
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

const setAgent = (data: Record<string, unknown>): Promise<void> =>
  writeFile(plist, serializePlist({ Label: 'com.t.brew', ...data } as never))

describe('readAgentScriptFile', () => {
  it('returns the file the agent runs, with the shell from its #! line', async () => {
    expect(await readAgentScriptFile(plist, script, dirs)).toEqual({
      ok: true,
      file: script,
      text: '#!/bin/zsh\nbrew update\n',
      shell: '/bin/zsh'
    })
  })

  it('prefers the shell the agent calls it with', async () => {
    await setAgent({ ProgramArguments: ['/bin/bash', script] })
    expect(await readAgentScriptFile(plist, script, dirs)).toMatchObject({
      ok: true,
      shell: '/bin/bash'
    })
  })

  it('accepts a .sh file without #! (zsh by default)', async () => {
    await writeFile(script, 'brew update\n')
    expect(await readAgentScriptFile(plist, script, dirs)).toMatchObject({
      ok: true,
      shell: '/bin/zsh'
    })
  })

  it('only reads the file named by the plist on disk', async () => {
    const other = join(base, 'secret.sh')
    await writeFile(other, '#!/bin/sh\nTOKEN=x\n')
    expect(await readAgentScriptFile(plist, other, dirs)).toEqual({
      ok: false,
      error: 'The command was changed: save it first, then switch to Script'
    })
  })

  it.each([
    ['not a script file', { ProgramArguments: ['/usr/bin/say', 'hi'] }],
    ['inline script', { ProgramArguments: ['/bin/zsh', '-c', 'echo'] }]
  ])('refuses when the agent runs %s', async (_n, data) => {
    await setAgent(data)
    expect(await readAgentScriptFile(plist, '/usr/bin/say', dirs)).toMatchObject({ ok: false })
  })

  it('refuses agents outside the given folders', async () => {
    const elsewhere = join(base, 'x.plist')
    await writeFile(elsewhere, serializePlist({ Label: 'x', Program: script }))
    expect(await readAgentScriptFile(elsewhere, script, dirs)).toMatchObject({ ok: false })
  })

  it('refuses another interpreter', async () => {
    await writeFile(script, '#!/usr/bin/env python3\nprint(1)\n')
    expect(await readAgentScriptFile(plist, script, dirs)).toMatchObject({
      ok: false,
      error: expect.stringContaining('python3')
    })
  })

  it.each([
    ['binary', Buffer.from([0x23, 0x21, 0x00, 0x01])],
    ['invalid UTF-8', Buffer.from([0x65, 0x63, 0x68, 0x6f, 0xff, 0xfe])],
    ['too large', Buffer.alloc(MAX_SCRIPT_BYTES + 1, 0x61)]
  ])('refuses %s content', async (_n, bytes) => {
    await writeFile(script, bytes)
    expect(await readAgentScriptFile(plist, script, dirs)).toMatchObject({ ok: false })
  })

  it('refuses a file that does not look like a script', async () => {
    const plain = join(base, 'tool')
    await writeFile(plain, 'just text')
    await setAgent({ Program: plain })
    expect(await readAgentScriptFile(plist, plain, dirs)).toMatchObject({
      ok: false,
      error: 'The file doesn’t look like a shell script'
    })
  })

  it('refuses a directory and a missing file', async () => {
    await rm(script)
    expect(await readAgentScriptFile(plist, script, dirs)).toMatchObject({ ok: false })
    await mkdir(script)
    expect(await readAgentScriptFile(plist, script, dirs)).toMatchObject({ ok: false })
  })

  it('follows a symlinked script', async () => {
    const link = join(base, 'link.sh')
    await symlink(script, link)
    await setAgent({ Program: link })
    expect(await readAgentScriptFile(plist, link, dirs)).toMatchObject({
      ok: true,
      text: '#!/bin/zsh\nbrew update\n'
    })
  })
})
