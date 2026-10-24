import type { FormErrors, ScriptShell } from './agent-form'
import type { ActionError } from './control-types'
import type { PlistDict, RealHint } from './plist-types'

/** A new or edited plist: a dict from form mode, or text from XML mode (saved as typed). */
export type PlistInput = { data: PlistDict; realHints?: RealHint[] } | { xml: string }

export interface CreateAgentOptions {
  /** Bootstrap the agent right after writing it. */
  load: boolean
}

export type CreateAgentResult =
  | {
      ok: true
      path: string
      /** Set when the file was written but loading it failed. */
      loadError?: ActionError
    }
  | {
      ok: false
      error: string
      /** Field-level problems (same paths as the form). */
      fieldErrors?: FormErrors
      /** plutil -lint output. */
      lint?: string
    }

export type PlistConvertResult =
  { ok: true; data: PlistDict; xml: string; realHints: RealHint[] } | { ok: false; error: string }

export interface SaveAgentOptions {
  /** `AgentDetail.hash` from when the editor was opened. */
  baseHash: string
}

export type SaveAgentResult =
  | {
      ok: true
      /** Where the previous version was copied. */
      backupPath: string
    }
  | {
      ok: false
      error: string
      fieldErrors?: FormErrors
      lint?: string
      /** The file changed on disk since it was opened. */
      conflict?: boolean
    }

export type DeleteAgentResult =
  | {
      ok: true
      backupPath: string
      /** The agent was loaded and has been booted out. */
      unloaded: boolean
    }
  | {
      ok: false
      error: string
      /** Set when bootout failed (nothing was deleted). */
      unloadError?: ActionError
    }

export type ScriptFileResult =
  | {
      ok: true
      file: string
      text: string
      /** Shell to run it with: how the agent called it, else its `#!` line, else zsh. */
      shell: ScriptShell
    }
  | { ok: false; error: string }
