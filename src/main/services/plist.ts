import { readFile } from 'fs/promises'
import { parse, parseBinary } from 'plist'
import type { PlistDict, PlistFormat, PlistValue, RealHint } from '../../shared/plist-types'
import { findRealHints, serializePlistXml } from './plistXml'

/** LaunchAgent plists are tiny; anything bigger is not something we should load. */
export const MAX_PLIST_BYTES = 1024 * 1024

const BINARY_MAGIC = 'bplist00'

export class PlistError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlistError'
  }
}

export interface ParsedPlist {
  format: PlistFormat
  data: PlistDict
  /** Original text for XML files; normalized XML for binary files. */
  xml: string
  /** `<real>`s in the XML text (none for binary files: their parser drops the distinction). */
  realHints: RealHint[]
}

export function detectFormat(buf: Uint8Array): PlistFormat {
  return Buffer.from(buf.subarray(0, BINARY_MAGIC.length)).toString('latin1') === BINARY_MAGIC
    ? 'binary'
    : 'xml'
}

function isDict(value: unknown): value is PlistDict {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array)
  )
}

function asDict(value: unknown): PlistDict {
  if (!isDict(value)) throw new PlistError('Plist root must be a <dict>')
  return value
}

export function parsePlistXml(xml: string): PlistDict {
  let value: unknown
  try {
    value = parse(xml)
  } catch (e) {
    throw new PlistError(`Malformed plist XML: ${(e as Error).message}`)
  }
  return asDict(value)
}

/** XML in Apple's layout; see serializePlistXml. Hints keep unchanged `<real>`s. */
export function serializePlist(data: PlistDict, realHints: RealHint[] = []): string {
  return serializePlistXml(data, realHints)
}

export function parsePlistBuffer(buf: Uint8Array): ParsedPlist {
  if (buf.byteLength > MAX_PLIST_BYTES) throw new PlistError('Plist file is too large')
  const format = detectFormat(buf)
  if (format === 'binary') {
    let value: unknown
    try {
      value = parseBinary(buf)
    } catch (e) {
      throw new PlistError(`Malformed binary plist: ${(e as Error).message}`)
    }
    const data = asDict(value)
    return { format, data, xml: serializePlist(data), realHints: [] }
  }
  const xml = Buffer.from(buf).toString('utf8')
  return { format, data: parsePlistXml(xml), xml, realHints: findRealHints(xml) }
}

export async function readPlistFile(path: string): Promise<ParsedPlist> {
  return parsePlistBuffer(await readFile(path))
}

export type { PlistDict, PlistValue }
