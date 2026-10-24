import {
  formToPlist,
  plistToForm,
  type AgentForm,
  type FormErrors
} from '../../../shared/agent-form'
import type { PlistConvertResult, PlistInput } from '../../../shared/edit-types'
import type { PlistValue } from '../../../shared/plist-types'
import { tidyForm } from './formEdit'

export type EditorMode = 'form' | 'xml'

/** What the agent editor holds. Only the field for the current mode is authoritative. */
export interface EditorDoc {
  mode: EditorMode
  form: AgentForm
  xml: string
  /**
   * XML text and the form parsed from it at the last XML → form switch. If the
   * form is unchanged when switching back, the user's exact text (comments,
   * formatting) is restored instead of re-serialized.
   */
  origin?: { xml: string; form: AgentForm }
}

export type Convert = (input: PlistInput) => Promise<PlistConvertResult>

export type SwitchResult =
  { ok: true; doc: EditorDoc } | { ok: false; error: string; fieldErrors?: FormErrors }

export function formDoc(form: AgentForm): EditorDoc {
  return { mode: 'form', form, xml: '' }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }
  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    return (
      a instanceof Uint8Array &&
      b instanceof Uint8Array &&
      a.length === b.length &&
      a.every((x, i) => x === b[i])
    )
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => deepEqual(x, b[i]))
    )
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return (
    ka.length === kb.length &&
    ka.every(
      (k, i) =>
        k === kb[i] &&
        deepEqual((a as Record<string, PlistValue>)[k], (b as Record<string, PlistValue>)[k])
    )
  )
}

export async function switchToXml(doc: EditorDoc, convert: Convert): Promise<SwitchResult> {
  if (doc.mode === 'xml') return { ok: true, doc }
  const form = tidyForm(doc.form)
  if (doc.origin && deepEqual(tidyForm(doc.origin.form), form)) {
    return { ok: true, doc: { mode: 'xml', form, xml: doc.origin.xml } }
  }
  const result = formToPlist(form)
  if (!result.ok) {
    return {
      ok: false,
      error: 'Fix the highlighted fields before switching to XML',
      fieldErrors: result.errors
    }
  }
  const converted = await convert({ data: result.data })
  if (!converted.ok) return { ok: false, error: converted.error }
  return { ok: true, doc: { mode: 'xml', form, xml: converted.xml } }
}

export async function switchToForm(doc: EditorDoc, convert: Convert): Promise<SwitchResult> {
  if (doc.mode === 'form') return { ok: true, doc }
  const converted = await convert({ xml: doc.xml })
  if (!converted.ok) {
    return {
      ok: false,
      error: `The XML is not a valid plist, so the form can’t show it: ${converted.error}`
    }
  }
  const form = plistToForm(converted.data)
  return { ok: true, doc: { mode: 'form', form, xml: doc.xml, origin: { xml: doc.xml, form } } }
}

/** The editor's content as save/create input. */
export function docInput(
  doc: EditorDoc
): { ok: true; input: PlistInput } | Extract<SwitchResult, { ok: false }> {
  if (doc.mode === 'xml') return { ok: true, input: { xml: doc.xml } }
  const result = formToPlist(tidyForm(doc.form))
  if (!result.ok)
    return { ok: false, error: 'Fix the highlighted fields', fieldErrors: result.errors }
  return { ok: true, input: { data: result.data } }
}
