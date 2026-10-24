import { randomUUID } from 'crypto'
import { link, lstat, mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { plistToForm, validateAgentForm } from '../../shared/agent-form'
import type { ActionResult } from '../../shared/control-types'
import type { CreateAgentResult, PlistConvertResult } from '../../shared/edit-types'
import { isValidLabel } from '../../shared/label'
import type { LintResult } from '../../shared/plist-types'
import { ensureLogDirs } from './logDirs'
import { assertWritablePath } from './paths'
import {
  MAX_PLIST_BYTES,
  parsePlistXml,
  serializePlist,
  type PlistDict,
  type PlistValue
} from './plist'

export interface CreateDeps {
  /** ~/Library/LaunchAgents */
  agentsDir: string
  roots: string[]
  lint: (xml: string) => Promise<LintResult>
  /** Bootstrap the written file. */
  load: (path: string) => Promise<ActionResult>
}

/** Expected failure carrying the result to return; shared by create and save. */
export class EditFailure extends Error {
  constructor(readonly result: Extract<CreateAgentResult, { ok: false }>) {
    super(result.error)
  }
}

export const failWith = (
  error: string,
  extra: Partial<Extract<CreateAgentResult, { ok: false }>> = {}
): never => {
  throw new EditFailure({ ok: false, error, ...extra })
}

function isPlistValue(v: unknown, depth = 0): v is PlistValue {
  if (depth > 64) return false
  if (typeof v === 'string' || typeof v === 'boolean') return true
  if (typeof v === 'number') return Number.isFinite(v)
  if (v instanceof Date) return !Number.isNaN(v.getTime())
  if (v instanceof Uint8Array) return true
  if (Array.isArray(v)) return v.every((x) => isPlistValue(x, depth + 1))
  return isPlainDict(v) && Object.values(v).every((x) => isPlistValue(x, depth + 1))
}

function isPlainDict(v: unknown): v is PlistDict {
  return typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype
}

/** Renderer input → (dict, exact text to write). XML text is written as typed. */
export function readPlistInput(input: unknown): { data: PlistDict; xml: string } {
  if (isPlainDict(input) && typeof input.xml === 'string') {
    if (Buffer.byteLength(input.xml) > MAX_PLIST_BYTES) failWith('Plist is too large')
    try {
      return { data: parsePlistXml(input.xml), xml: input.xml }
    } catch (e) {
      return failWith((e as Error).message)
    }
  }
  if (isPlainDict(input) && isPlainDict(input.data) && isPlistValue(input.data)) {
    const xml = serializePlist(input.data)
    if (Buffer.byteLength(xml) > MAX_PLIST_BYTES) failWith('Plist is too large')
    return { data: input.data, xml }
  }
  return failWith('Invalid plist input')
}

/** Editor mode switch: form dict → XML text, or XML text → dict. Never throws. */
export function convertPlistInput(input: unknown): PlistConvertResult {
  try {
    return { ok: true, ...readPlistInput(input) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Same rules as the form, re-checked in main: the renderer is not trusted. */
export function checkAgentData(data: PlistDict): string {
  const fieldErrors = validateAgentForm(plistToForm(data))
  if (Object.keys(fieldErrors).length > 0) failWith('Fix the highlighted fields', { fieldErrors })
  const label = data.Label
  if (!isValidLabel(label)) {
    failWith('Label is missing or invalid', { fieldErrors: { label: 'A valid Label is required' } })
  }
  return label as string
}

async function exists(p: string): Promise<boolean> {
  return lstat(p).then(
    () => true,
    () => false
  )
}

/**
 * Validates, lints and writes `~/Library/LaunchAgents/<Label>.plist`, then
 * optionally loads it. Never overwrites: the file is written to a hidden temp
 * name and hard-linked into place, which fails if the name is taken.
 */
export async function createAgent(
  input: unknown,
  options: unknown,
  deps: CreateDeps
): Promise<CreateAgentResult> {
  try {
    const { data, xml } = readPlistInput(input)
    const label = checkAgentData(data)

    const lint = await deps.lint(xml)
    if (!lint.ok) failWith('plutil -lint rejected the plist', { lint: lint.message })

    const fileName = `${label}.plist`
    const path = join(deps.agentsDir, fileName)
    const target = await assertWritablePath(path, deps.roots)
    if (await exists(target)) failWith(`${fileName} already exists in LaunchAgents`)

    const logs = [data.StandardOutPath, data.StandardErrorPath].map((p) =>
      typeof p === 'string' ? p : undefined
    )
    await ensureLogDirs(logs, deps.roots)

    await mkdir(deps.agentsDir, { recursive: true })
    const temp = join(deps.agentsDir, `.${fileName}.${randomUUID()}.tmp`)
    try {
      await writeFile(temp, xml, { flag: 'wx', mode: 0o644 })
      await link(temp, target).catch((e: NodeJS.ErrnoException) =>
        e.code === 'EEXIST'
          ? failWith(`${fileName} already exists in LaunchAgents`)
          : Promise.reject(e)
      )
    } finally {
      await rm(temp, { force: true })
    }

    const load = isPlainDict(options) && options.load === true
    if (!load) return { ok: true, path }
    const loaded = await deps.load(path)
    return loaded.ok ? { ok: true, path } : { ok: true, path, loadError: loaded.error }
  } catch (e) {
    if (e instanceof EditFailure) return e.result
    return { ok: false, error: (e as Error).message }
  }
}
