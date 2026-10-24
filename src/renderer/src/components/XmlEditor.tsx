import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { xml } from '@codemirror/lang-xml'
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { useEffect, useRef } from 'react'

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

/**
 * Plist XML editor, mounted in a shadow root: CodeMirror then injects its
 * styles as constructable stylesheets, which the strict `style-src 'self'`
 * CSP allows (a <style> tag would be blocked).
 *
 * Uncontrolled inside (CodeMirror owns the text): `value` changes from outside
 * replace the document, edits are reported via onChange.
 */
export function XmlEditor({
  value,
  onChange,
  readOnly = false,
  ariaLabel = 'Plist XML'
}: {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  ariaLabel?: string
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const shadow = host.current!.shadowRoot ?? host.current!.attachShadow({ mode: 'open' })
    const container = document.createElement('div')
    container.style.height = '100%'
    shadow.replaceChildren(container)
    const v = new EditorView({
      parent: container,
      root: shadow,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          xml(),
          syntaxHighlighting(highlight),
          theme,
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current?.(u.state.doc.toString())
          })
        ]
      })
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // Created once per mount; value updates are applied below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, ariaLabel])

  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  return <div className="xml-editor" ref={host} />
}
