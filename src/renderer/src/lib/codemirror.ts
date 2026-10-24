import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
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
  // shell
  { tag: [tags.keyword, tags.standard(tags.variableName)], color: 'var(--code-tag)' },
  { tag: tags.string, color: 'var(--code-string)' },
  { tag: [tags.special(tags.variableName), tags.variableName], color: 'var(--code-attr)' },
  { tag: tags.invalid, color: 'var(--danger)' }
])

const theme = EditorView.theme({
  '&': {
    height: '100%',
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

export type CodeLanguage = 'xml' | 'shell'

const shellLanguage = StreamLanguage.define(shell)

/** Language, colors and theme shared by the editors and the diff view. */
export function codeLook(language: CodeLanguage): Extension {
  return [
    language === 'xml' ? xml() : shellLanguage,
    syntaxHighlighting(highlight),
    theme,
    EditorView.lineWrapping
  ]
}

export const xmlLook = (): Extension => codeLook('xml')

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
