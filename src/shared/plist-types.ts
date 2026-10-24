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
