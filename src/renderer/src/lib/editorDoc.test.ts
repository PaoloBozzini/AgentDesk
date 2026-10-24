import { build, parse } from 'plist'
import { describe, expect, it, vi } from 'vitest'
import { emptyAgentForm, plistToForm } from '../../../shared/agent-form'
import type { PlistInput } from '../../../shared/edit-types'
import type { PlistDict } from '../../../shared/plist-types'
import { deepEqual, docInput, formDoc, switchToForm, switchToXml, type Convert } from './editorDoc'

// Stand-in for the main-process converter
const convert = vi.fn<Convert>(async (input: PlistInput) => {
  try {
    if ('xml' in input) {
      const data = parse(input.xml) as PlistDict
      if (typeof data !== 'object' || Array.isArray(data)) throw new Error('root must be a dict')
      return { ok: true, data, xml: input.xml, realHints: [] }
    }
    return { ok: true, data: input.data, xml: build(input.data as never), realHints: [] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})

const form = { ...emptyAgentForm(), label: 'com.t.a', programArguments: ['/bin/echo', 'hi'] }

describe('switching modes', () => {
  it('form → XML → form preserves the form', async () => {
    const toXml = await switchToXml(formDoc(form), convert)
    if (!toXml.ok) throw new Error(toXml.error)
    expect(toXml.doc.mode).toBe('xml')
    expect(toXml.doc.xml).toContain('<string>com.t.a</string>')
    const back = await switchToForm(toXml.doc, convert)
    if (!back.ok) throw new Error(back.error)
    expect(back.doc.form).toMatchObject({ label: 'com.t.a', programArguments: ['/bin/echo', 'hi'] })
  })

  it('XML edits show up in the form', async () => {
    const toXml = await switchToXml(formDoc(form), convert)
    if (!toXml.ok) throw new Error()
    const edited = { ...toXml.doc, xml: toXml.doc.xml.replace('com.t.a', 'com.t.edited') }
    const back = await switchToForm(edited, convert)
    expect(back.ok && back.doc.form.label).toBe('com.t.edited')
  })

  it('form edits show up in the XML', async () => {
    const xml = build({ Label: 'com.t.a', Program: '/bin/true', Custom: 7 } as never)
    const back = await switchToForm({ mode: 'xml', form, realHints: [], xml }, convert)
    if (!back.ok) throw new Error()
    const again = await switchToXml(
      { ...back.doc, form: { ...back.doc.form, runAtLoad: 'true' } },
      convert
    )
    if (!again.ok) throw new Error()
    expect(parse(again.doc.xml)).toEqual({
      Label: 'com.t.a',
      Program: '/bin/true',
      Custom: 7,
      RunAtLoad: true
    })
  })

  it('XML → form → XML without edits restores the exact text', async () => {
    const xml = build({ Label: 'com.t.a', Program: '/bin/true' } as never).replace(
      '<dict>',
      '<dict>\n  <!-- keep me -->'
    )
    convert.mockClear()
    const back = await switchToForm({ mode: 'xml', form, realHints: [], xml }, convert)
    if (!back.ok) throw new Error()
    const again = await switchToXml(back.doc, convert)
    expect(again.ok && again.doc.xml).toBe(xml)
    expect(convert).toHaveBeenCalledTimes(1)
  })

  it('invalid XML blocks switching to the form', async () => {
    const result = await switchToForm(
      { mode: 'xml', form, realHints: [], xml: '<plist><dict><key>x' },
      convert
    )
    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.error).toMatch(/^The XML is not a valid plist/)
  })

  it('XML with a non-dict root blocks switching', async () => {
    const result = await switchToForm(
      { mode: 'xml', form, realHints: [], xml: build(['a'] as never) },
      convert
    )
    expect(result.ok).toBe(false)
  })

  it('invalid form fields block switching to XML with field errors', async () => {
    const result = await switchToXml(formDoc({ ...form, startInterval: 'soon' }), convert)
    expect(result).toMatchObject({ ok: false, fieldErrors: { startInterval: expect.any(String) } })
  })

  it('same-mode switch is a no-op', async () => {
    const doc = formDoc(form)
    expect(await switchToForm(doc, convert)).toEqual({ ok: true, doc })
  })
})

describe('docInput', () => {
  it('uses XML text as typed in XML mode', () => {
    expect(docInput({ mode: 'xml', form, realHints: [], xml: '<x/>' })).toEqual({
      ok: true,
      input: { xml: '<x/>' }
    })
  })

  it('validates the form in form mode', () => {
    expect(docInput(formDoc(form))).toMatchObject({
      ok: true,
      input: { data: { Label: 'com.t.a' } }
    })
    expect(docInput(formDoc({ ...form, label: '' }))).toMatchObject({ ok: false })
  })
})

describe('deepEqual', () => {
  it('compares plist values', () => {
    const a = plistToForm({ D: new Date(0), B: new Uint8Array([1, 2]), A: [{ x: 1 }] })
    const b = plistToForm({ D: new Date(0), B: new Uint8Array([1, 2]), A: [{ x: 1 }] })
    expect(deepEqual(a, b)).toBe(true)
    expect(deepEqual(new Date(0), new Date(1))).toBe(false)
    expect(deepEqual(new Uint8Array([1]), new Uint8Array([2]))).toBe(false)
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false)
    expect(deepEqual([1], { 0: 1 })).toBe(false)
  })
})
