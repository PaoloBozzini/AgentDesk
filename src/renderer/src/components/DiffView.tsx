import { MergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { shadowContainer, xmlLook } from '../lib/codemirror'

/** Read-only side-by-side diff of two plist XML texts (before | after). */
export function DiffView({ before, after }: { before: string; after: string }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const { root, container } = shadowContainer(host.current!)
    const extensions = [
      lineNumbers(),
      xmlLook(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false)
    ]
    const view = new MergeView({
      a: { doc: before, extensions },
      b: { doc: after, extensions },
      parent: container,
      root,
      collapseUnchanged: { margin: 3, minSize: 6 },
      gutter: true
    })
    return () => view.destroy()
  }, [before, after])

  return <div className="diff-view" ref={host} aria-label="Changes: before and after" />
}
