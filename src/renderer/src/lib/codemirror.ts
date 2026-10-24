import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { xml } from '@codemirror/lang-xml'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

/** Colors are CSS variables (base.css), which inherit into the shadow root. */
const highlight = HighlightStyle.define([
  { tag: tags.tagName, color: 'var(--code-tag)' },
  { tag: tags.attributeName, color: 'var(--code-attr)' },
  { tag: tags.attributeValue, color: 'var(--code-string)' },
  { tag: tags.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
  {
    tag: [tags.angleBracket, tags.processingInstruction, tags.documentMeta],
    color: 'var(--text-muted)'
  },
  { tag: tags.invalid, color: 'var(--danger)' }
])

const theme = EditorView.theme({
  '&': {
    height: '100%',
    minHeight: '320px',
    fontSize: '12px',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)'
  },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.5' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border)'
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--bg-hover)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--bg-selected) !important'
  }
})

/** XML language, colors and theme shared by the editor and the diff view. */
export function xmlLook(): Extension {
  return [xml(), syntaxHighlighting(highlight), theme, EditorView.lineWrapping]
}

/**
 * Container inside a shadow root of `host`. CodeMirror mounted there injects
 * its styles as constructable stylesheets, which the strict
 * `style-src 'self'` CSP allows (a <style> tag would be blocked).
 */
export function shadowContainer(host: HTMLElement): { root: ShadowRoot; container: HTMLElement } {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  const container = document.createElement('div')
  container.style.height = '100%'
  root.replaceChildren(container)
  return { root, container }
}
