import { isScriptShell, type ScriptShell } from '../../shared/agent-form'
import type { PlistDict } from '../../shared/plist-types'
import { execFileAsync, type ExecFn } from './launchctl/runner'

const TIMEOUT_MS = 10_000

/** The inline script of a Script-mode agent: `ProgramArguments = [shell, -c, script]`, no Program. */
export function scriptOf(data: PlistDict): { shell: ScriptShell; script: string } | undefined {
  const args = data.ProgramArguments
  if (data.Program !== undefined || !Array.isArray(args) || args.length !== 3) return undefined
  const [shell, flag, script] = args
  if (!isScriptShell(shell) || flag !== '-c' || typeof script !== 'string') return undefined
  return { shell, script }
}

/** `zsh:3: parse error…` / `/bin/bash: -c: line 3: syntax error…` → `line 3: …` */
export function tidySyntaxError(output: string): string {
  const lines = output
    .split('\n')
    .map((line) => {
      const zsh = /^zsh:(\d+): (.*)$/.exec(line)
      if (zsh) return `line ${zsh[1]}: ${zsh[2]}`
      const sh = /^\S+: -c: (line \d+: .*)$/.exec(line)
      return sh ? sh[1] : line
    })
    .filter((line) => line.trim() !== '')
  return lines.join('\n') || 'Syntax error'
}

/**
 * Parses the script with `<shell> -n -c <script>`: `-n` reads commands without
 * executing any. Resolves an error message, or undefined when it parses.
 */
export async function checkScriptSyntax(
  shell: ScriptShell,
  script: string,
  exec: ExecFn = execFileAsync
): Promise<string | undefined> {
  const result = await exec(shell, ['-n', '-c', script], TIMEOUT_MS)
  if (result.code === 0 && !result.timedOut) return undefined
  if (result.timedOut) return 'Checking the script timed out'
  return tidySyntaxError(result.stderr || result.stdout)
}
