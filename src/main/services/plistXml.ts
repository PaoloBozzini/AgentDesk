import { DOMParser, type Element } from '@xmldom/xmldom'
import type { PlistDict, PlistPath, PlistValue, RealHint } from '../../shared/plist-types'

const HEADER = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
  '<plist version="1.0">'
]

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;')

const pathKey = (path: PlistPath): string => JSON.stringify(path)

/**
 * XML plist in Apple's layout (what plutil and Xcode write): tab indent, root
 * <dict> at column 0. A number is written as `<real>` with its original text
 * when a hint for its path says it was a real with that value; otherwise
 * integers are `<integer>` and fractions `<real>`.
 */
export function serializePlistXml(data: PlistDict, hints: RealHint[] = []): string {
  const reals = new Map(hints.map((h) => [pathKey(h.path), h.text]))
  const lines = [...HEADER]

  const write = (value: PlistValue, depth: number, path: PlistPath): void => {
    const pad = '\t'.repeat(depth)
    if (typeof value === 'string') {
      lines.push(`${pad}<string>${escapeText(value)}</string>`)
    } else if (typeof value === 'boolean') {
      lines.push(`${pad}<${value}/>`)
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error(`Cannot write ${value} in a plist`)
      const hint = reals.get(pathKey(path))
      if (hint !== undefined && Number(hint) === value) lines.push(`${pad}<real>${hint}</real>`)
      else if (Number.isInteger(value)) lines.push(`${pad}<integer>${value}</integer>`)
      else lines.push(`${pad}<real>${value}</real>`)
    } else if (value instanceof Date) {
      lines.push(`${pad}<date>${value.toISOString().replace(/\.\d{3}Z$/, 'Z')}</date>`)
    } else if (value instanceof Uint8Array) {
      lines.push(`${pad}<data>${Buffer.from(value).toString('base64')}</data>`)
    } else if (Array.isArray(value)) {
      if (value.length === 0) return void lines.push(`${pad}<array/>`)
      lines.push(`${pad}<array>`)
      value.forEach((v, i) => write(v, depth + 1, [...path, i]))
      lines.push(`${pad}</array>`)
    } else {
      const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== null)
      if (entries.length === 0) return void lines.push(`${pad}<dict/>`)
      lines.push(`${pad}<dict>`)
      for (const [k, v] of entries) {
        lines.push(`${pad}\t<key>${escapeText(k)}</key>`)
        write(v, depth + 1, [...path, k])
      }
      lines.push(`${pad}</dict>`)
    }
  }

  write(data, 0, [])
  lines.push('</plist>', '')
  return lines.join('\n')
}

const childElements = (el: Element): Element[] => {
  const out: Element[] = []
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element)
  return out
}

/** Every `<real>` in plist XML with its path and trimmed text. [] if the XML can't be read. */
export function findRealHints(xml: string): RealHint[] {
  const hints: RealHint[] = []
  let root: Element | null
  try {
    const doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml')
    root = doc.documentElement
  } catch {
    return []
  }
  if (!root || root.tagName !== 'plist') return []

  const walk = (el: Element, path: PlistPath): void => {
    if (el.tagName === 'real') {
      hints.push({ path, text: (el.textContent ?? '').trim() })
    } else if (el.tagName === 'array') {
      childElements(el).forEach((c, i) => walk(c, [...path, i]))
    } else if (el.tagName === 'dict') {
      const children = childElements(el)
      for (let i = 0; i + 1 < children.length; i += 2) {
        if (children[i].tagName !== 'key') return
        walk(children[i + 1], [...path, children[i].textContent ?? ''])
      }
    }
  }
  const top = childElements(root)[0]
  if (top) walk(top, [])
  return hints
}
