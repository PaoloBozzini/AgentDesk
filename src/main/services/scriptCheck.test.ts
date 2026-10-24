import { existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type { ExecFn } from './launchctl/runner'
import { checkScriptSyntax, scriptOf, tidySyntaxError } from './scriptCheck'

describe('scriptOf', () => {
  it('finds [shell, -c, script] without Program', () => {
    const expected = { shell: '/bin/zsh', script: 'echo' }
    expect(scriptOf({ ProgramArguments: ['/bin/zsh', '-c', 'echo'] })).toEqual(expected)
  })

  it.each([
    [{ ProgramArguments: ['/bin/zsh', '-c', 'echo'], Program: '/bin/zsh' }],
    [{ ProgramArguments: ['/usr/bin/python3', '-c', 'print(1)'] }],
    [{ ProgramArguments: ['/bin/zsh', 'script.sh'] }],
    [{ ProgramArguments: ['/bin/zsh', '-c', 'echo', 'x'] }],
    [{ ProgramArguments: 'nope' }],
    [{}]
  ])('ignores %j', (data) => {
    expect(scriptOf(data as never)).toBeUndefined()
  })
})

describe('tidySyntaxError', () => {
  it('normalises zsh and bash/sh messages to "line N: …"', () => {
    expect(tidySyntaxError("zsh:3: parse error near `fi'\n")).toBe("line 3: parse error near `fi'")
    expect(tidySyntaxError('/bin/bash: -c: line 2: syntax error: unexpected end of file\n')).toBe(
      'line 2: syntax error: unexpected end of file'
    )
    expect(tidySyntaxError('')).toBe('Syntax error')
  })
})

describe('checkScriptSyntax', () => {
  it.each(['/bin/zsh', '/bin/bash', '/bin/sh'] as const)(
    '%s: accepts a valid script',
    async (shell) => {
      expect(
        await checkScriptSyntax(shell, 'for f in a b; do\n  echo "$f"\ndone\n')
      ).toBeUndefined()
    }
  )

  it.each(['/bin/zsh', '/bin/bash', '/bin/sh'] as const)(
    '%s: reports a syntax error with its line',
    async (shell) => {
      expect(await checkScriptSyntax(shell, 'echo ok\nif true; then\n  echo hi\n')).toMatch(
        /^line \d+: /
      )
    }
  )

  it('never executes the script', async () => {
    const marker = join(tmpdir(), `agentdesk-syntax-${process.pid}`)
    rmSync(marker, { force: true })
    expect(await checkScriptSyntax('/bin/zsh', `touch '${marker}'`)).toBeUndefined()
    expect(existsSync(marker)).toBe(false)
  })

  it('runs the shell with -n -c and the script as one argument', async () => {
    const seen: string[][] = []
    const exec: ExecFn = async (file, args) => {
      seen.push([file, ...args])
      return { stdout: '', stderr: '', code: 0, signal: null, timedOut: false }
    }
    await checkScriptSyntax('/bin/bash', 'echo $(rm -rf /)', exec)
    expect(seen).toEqual([['/bin/bash', '-n', '-c', 'echo $(rm -rf /)']])
  })

  it('reports a timeout', async () => {
    const exec: ExecFn = async () => ({
      stdout: '',
      stderr: '',
      code: null,
      signal: 'SIGTERM',
      timedOut: true
    })
    expect(await checkScriptSyntax('/bin/zsh', 'x', exec)).toBe('Checking the script timed out')
  })
})
