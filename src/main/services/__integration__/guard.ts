import { isAbsolute, relative } from 'path'
import type { ExecFn } from '../launchctl/runner'

export const TEST_PREFIX = 'com.agentdesk.test.'

export function isTestLabel(label: string): boolean {
  return label.startsWith(TEST_PREFIX) && label.length > TEST_PREFIX.length
}

/**
 * Wraps the real exec so integration tests can only ever touch
 * `com.agentdesk.test.*` services and plists inside their temp folder.
 * Read-only domain prints are allowed. Anything else throws before launchctl runs.
 */
export function guardedExec(real: ExecFn, sandboxDir: string): ExecFn {
  return (file, args, timeoutMs) => {
    assertSafe(args, sandboxDir)
    return real(file, args, timeoutMs)
  }
}

export function assertSafe(args: string[], sandboxDir: string): void {
  const [cmd, ...rest] = args
  const fail = (why: string): never => {
    throw new Error(`Integration guard blocked "launchctl ${args.join(' ')}": ${why}`)
  }
  const READ_ONLY = new Set(['print', 'print-disabled'])
  for (const arg of rest) {
    if (arg.startsWith('-')) continue
    const service = /^(?:gui\/\d+|system)\/(.+)$/.exec(arg)
    if (service && !isTestLabel(service[1])) fail(`label ${service[1]} lacks ${TEST_PREFIX}`)
    if (arg.startsWith('system/') && !READ_ONLY.has(cmd)) fail('system domain is read-only')
    if (/^(?:gui\/\d+|system)$/.test(arg)) {
      if (!READ_ONLY.has(cmd) && cmd !== 'bootstrap') fail('domain-wide command')
      if (arg === 'system' && !READ_ONLY.has(cmd)) fail('system domain is read-only')
      continue
    }
    if (isAbsolute(arg)) {
      const rel = relative(sandboxDir, arg)
      if (rel.startsWith('..') || isAbsolute(rel)) fail(`path ${arg} is outside the sandbox`)
      const file = arg.split('/').pop() ?? ''
      if (!isTestLabel(file.replace(/\.plist$/, ''))) fail(`plist ${file} lacks ${TEST_PREFIX}`)
    }
  }
  if (cmd === 'bootstrap' && rest.length !== 2) fail('bootstrap needs a domain and a plist')
}
