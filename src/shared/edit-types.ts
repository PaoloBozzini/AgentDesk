import type { FormErrors } from './agent-form'
import type { ActionError } from './control-types'
import type { PlistDict } from './plist-types'

/** A new or edited plist: a dict from form mode, or text from XML mode (saved as typed). */
export type PlistInput = { data: PlistDict } | { xml: string }

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
  { ok: true; data: PlistDict; xml: string } | { ok: false; error: string }

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
