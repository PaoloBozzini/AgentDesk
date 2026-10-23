import type { PlistDict, PlistValue } from '../../../shared/plist-types'
import { formatScalar, kindOf, orderedKeys } from '../lib/plist-display'

function Value({ value }: { value: PlistValue }): React.JSX.Element {
  switch (kindOf(value)) {
    case 'dict': {
      const dict = value as PlistDict
      return Object.keys(dict).length === 0 ? (
        <span className="muted">{'{}'}</span>
      ) : (
        <PlistTree dict={dict} />
      )
    }
    case 'array': {
      const items = value as PlistValue[]
      if (items.length === 0) return <span className="muted">[]</span>
      return (
        <ol className="plist-array">
          {items.map((item, i) => (
            <li key={i}>
              <Value value={item} />
            </li>
          ))}
        </ol>
      )
    }
    default:
      return <span className={`plist-scalar t-${typeof value}`}>{formatScalar(value)}</span>
  }
}

export function PlistTree({ dict }: { dict: PlistDict }): React.JSX.Element {
  return (
    <dl className="plist-tree">
      {orderedKeys(dict).map((key) => (
        <div className="plist-entry" key={key}>
          <dt>{key}</dt>
          <dd>
            <Value value={dict[key]} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
