import { readFile, stat } from 'fs/promises'
import {
  hasScriptExtension,
  plistToForm,
  scriptFileOf,
  shellFromShebang
} from '../../shared/agent-form'
import type { ScriptFileResult } from '../../shared/edit-types'
import { readAgent, type AgentDir } from './agents'

export const MAX_SCRIPT_BYTES = 256 * 1024

/**
 * Reads the script file an agent runs, for "copy its contents into the agent".
 * The renderer only names the agent: the file comes from the plist on disk, so
 * nothing else can be read. `expectedFile` is what the editor shows; if the
 * form was changed to point elsewhere, nothing is read. Read-only.
 */
export async function readAgentScriptFile(
  agentPath: unknown,
  expectedFile: unknown,
  dirs: AgentDir[]
): Promise<ScriptFileResult> {
  try {
    const detail = await readAgent(agentPath, dirs)
    const candidate = scriptFileOf(plistToForm(detail.data))
    if (!candidate) return { ok: false, error: 'This agent doesn’t run a script file' }
    if (candidate.file !== expectedFile) {
      return { ok: false, error: 'The command was changed: save it first, then switch to Script' }
    }

    const info = await stat(candidate.file)
    if (!info.isFile()) return { ok: false, error: `${candidate.file} is not a file` }
    if (info.size > MAX_SCRIPT_BYTES) return { ok: false, error: 'The script file is too large' }
    const bytes = await readFile(candidate.file)
    if (bytes.includes(0)) return { ok: false, error: 'The file is not a text script' }
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      return { ok: false, error: 'The file is not UTF-8 text' }
    }

    const shebang = shellFromShebang(text)
    if (!text.startsWith('#!') && !hasScriptExtension(candidate.file) && !candidate.shell) {
      return { ok: false, error: 'The file doesn’t look like a shell script' }
    }
    if (!candidate.shell && shebang.interpreter) {
      return {
        ok: false,
        error: `It runs with ${shebang.interpreter}; Script mode supports zsh, bash and sh`
      }
    }
    return {
      ok: true,
      file: candidate.file,
      text,
      shell: candidate.shell ?? shebang.shell ?? '/bin/zsh'
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
