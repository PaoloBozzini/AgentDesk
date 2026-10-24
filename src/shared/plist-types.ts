/** Plist values as they cross IPC (structured clone keeps Date and Uint8Array). */
export type PlistValue =
  string | number | boolean | Date | Uint8Array | PlistValue[] | { [key: string]: PlistValue }

export type PlistDict = { [key: string]: PlistValue }

export type PlistFormat = 'xml' | 'binary'

/** `plutil -lint` outcome; `message` is plutil's text without the temp file path. */
export interface LintResult {
  ok: boolean
  message: string
}

/** Key / index path from the root dict to a value. */
export type PlistPath = (string | number)[]

/**
 * A `<real>` in the source XML and its exact text. JS numbers lose the
 * real/integer distinction (`<real>2.0</real>` parses to 2), so saves use these
 * to write unchanged reals back as they were.
 */
export interface RealHint {
  path: PlistPath
  text: string
}
