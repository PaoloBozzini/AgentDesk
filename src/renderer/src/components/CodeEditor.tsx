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
import { codeLook, shadowContainer, type CodeLanguage } from '../lib/codemirror'

/**
 * Code editor (plist XML or shell script), mounted in a shadow root (see shadowContainer).
 *
 * Uncontrolled inside (CodeMirror owns the text): `value` changes from outside
 * replace the document, edits are reported via onChange.
 */
export function CodeEditor({
  value,
  onChange,
  language = 'xml',
  readOnly = false,
  ariaLabel = 'Plist XML',
  className = 'xml-editor',
  invalid = false
}: {
  value: string
  onChange?: (value: string) => void
  language?: CodeLanguage
  readOnly?: boolean
  ariaLabel?: string
  className?: string
  invalid?: boolean
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
          codeLook(language),
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
  }, [readOnly, ariaLabel, language])

  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  return (
    <div
      className={invalid ? `${className} has-error` : className}
      ref={host}
      aria-invalid={invalid}
    />
  )
}
