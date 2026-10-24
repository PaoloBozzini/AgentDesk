import { readFileSync } from 'fs'
import { join } from 'path'
import { build } from 'plist'
import { describe, expect, it } from 'vitest'
import { formToPlist, plistToForm } from '../../shared/agent-form'
import { parsePlistBuffer, parsePlistXml } from './plist'
import { findRealHints, serializePlistXml } from './plistXml'

const FIXTURE = readFileSync(join(__dirname, '__fixtures__/plist/full-agent.plist'), 'utf8')

const wrap = (body: string): string =>
  serializePlistXml({}).replace('<dict/>', `<dict>\n${body}\n</dict>`)

describe('findRealHints', () => {
  it('finds reals with their paths and exact text', () => {
    const xml = wrap(
      [
        '\t<key>A</key><real>2.0</real>',
        '\t<key>B</key><integer>2</integer>',
        '\t<key>C</key><dict><key>D</key><array><string>x</string><real> 1.50 </real></array></dict>'
      ].join('\n')
    )
    expect(findRealHints(xml)).toEqual([
      { path: ['A'], text: '2.0' },
      { path: ['C', 'D', 1], text: '1.50' }
    ])
  })

  it('returns [] for unreadable input', () => {
    expect(findRealHints('not xml')).toEqual([])
    expect(findRealHints('<foo/>')).toEqual([])
  })
})

describe('serializePlistXml', () => {
  it('writes whole-number reals back as <real> with their original text', () => {
    const xml = wrap(
      '\t<key>ExitTimeOut</key>\n\t<real>2.0</real>\n\t<key>Nice</key>\n\t<integer>2</integer>'
    )
    const { data, realHints } = parsePlistBuffer(Buffer.from(xml))
    expect(data).toEqual({ ExitTimeOut: 2, Nice: 2 })
    expect(serializePlistXml(data, realHints)).toBe(xml)
  })

  it('keeps the exact text of fractional reals too', () => {
    const xml = wrap('\t<key>R</key>\n\t<real>2.50</real>')
    const { data, realHints } = parsePlistBuffer(Buffer.from(xml))
    expect(serializePlistXml(data, realHints)).toContain('<real>2.50</real>')
    expect(serializePlistXml(data)).toContain('<real>2.5</real>')
  })

  it('drops a hint whose value changed', () => {
    const hints = [{ path: ['R'], text: '2.0' }]
    expect(serializePlistXml({ R: 3 }, hints)).toContain('<integer>3</integer>')
    expect(serializePlistXml({ R: 2 }, hints)).toContain('<real>2.0</real>')
    expect(serializePlistXml({ R: '2' }, hints)).toContain('<string>2</string>')
  })

  it('reproduces the full fixture byte for byte', () => {
    const { data, realHints } = parsePlistBuffer(Buffer.from(FIXTURE))
    expect(serializePlistXml(data, realHints)).toBe(FIXTURE)
  })

  it('round-trips <real>2.0</real> through the form unchanged', () => {
    const xml = wrap(
      '\t<key>Label</key>\n\t<string>com.t.a</string>\n\t<key>Program</key>\n\t<string>/bin/true</string>\n\t<key>ExitTimeOut</key>\n\t<real>2.0</real>'
    )
    const { data, realHints } = parsePlistBuffer(Buffer.from(xml))
    const result = formToPlist(plistToForm(data))
    if (!result.ok) throw new Error('invalid')
    expect(serializePlistXml(result.data, realHints)).toBe(xml)
  })

  it('matches the plist library on values it handles', () => {
    const data = {
      S: 'a & <b> "c"\r\nd',
      I: -5,
      F: 0.25,
      T: true,
      N: false,
      D: new Date('2026-10-23T10:00:00.000Z'),
      B: new Uint8Array([104, 105]),
      E: {},
      L: [],
      Nested: { A: [1, 'x', { K: 'v' }] }
    }
    expect(parsePlistXml(serializePlistXml(data))).toEqual(parsePlistXml(build(data as never)))
  })

  it('rejects non-finite numbers', () => {
    expect(() => serializePlistXml({ X: NaN })).toThrow()
  })
})
