import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { shadowContainer, xmlLook } from '../lib/codemirror'

/**
 * Plist XML editor, mounted in a shadow root (see shadowContainer).
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
    const { root: shadow, container } = shadowContainer(host.current!)
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
          xmlLook(),
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
