import { readdir } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type { AgentScope, AgentSummary } from '../../shared/agent-types'
import { readPlistFile, type PlistDict } from './plist'

export interface AgentDir {
  dir: string
  scope: AgentScope
}

export function userAgentsDir(home = homedir()): string {
  return join(home, 'Library', 'LaunchAgents')
}

export const SYSTEM_AGENT_DIRS: AgentDir[] = [
  { dir: '/Library/LaunchAgents', scope: 'global-agent' },
  { dir: '/Library/LaunchDaemons', scope: 'global-daemon' }
]

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : undefined
}

/** Pure: build a summary from a parsed plist. */
export function summarize(
  path: string,
  fileName: string,
  scope: AgentScope,
  data: PlistDict
): Omit<AgentSummary, 'format'> {
  const label = typeof data.Label === 'string' ? data.Label : undefined
  return {
    path,
    fileName,
    scope,
    readOnly: scope !== 'user',
    label,
    program: typeof data.Program === 'string' ? data.Program : undefined,
    programArguments: stringArray(data.ProgramArguments),
    labelMismatch: label !== undefined && fileName !== `${label}.plist`
  }
}

async function listDir({ dir, scope }: AgentDir): Promise<AgentSummary[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
  const plists = names.filter((n) => n.endsWith('.plist') && !n.startsWith('.'))
  return Promise.all(
    plists.map(async (fileName): Promise<AgentSummary> => {
      const path = join(dir, fileName)
      try {
        const parsed = await readPlistFile(path)
        return { ...summarize(path, fileName, scope, parsed.data), format: parsed.format }
      } catch (e) {
        return {
          path,
          fileName,
          scope,
          readOnly: scope !== 'user',
          labelMismatch: false,
          error: (e as Error).message
        }
      }
    })
  )
}

export function sortAgents(agents: AgentSummary[]): AgentSummary[] {
  const key = (a: AgentSummary): string => (a.label ?? a.fileName).toLowerCase()
  return [...agents].sort((a, b) => key(a).localeCompare(key(b)))
}

export async function listAgents(dirs: AgentDir[]): Promise<AgentSummary[]> {
  const all = await Promise.all(dirs.map(listDir))
  return sortAgents(all.flat())
}
