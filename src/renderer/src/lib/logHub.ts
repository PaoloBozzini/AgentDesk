import type { LogEvent } from '../../../shared/log-types'

/**
 * Single listener for all log events. Events can arrive before the component
 * learns its subscription id (the invoke reply races the first push), so
 * events for unknown ids are buffered briefly and replayed on `listen`.
 */

type Listener = (event: LogEvent) => void

const MAX_PENDING_IDS = 20
const MAX_PENDING_EVENTS = 500

const listeners = new Map<string, Listener>()
const pending = new Map<string, LogEvent[]>()
let installed = false

export function dispatch(event: LogEvent): void {
  const listener = listeners.get(event.id)
  if (listener) return listener(event)
  let queue = pending.get(event.id)
  if (!queue) {
    if (pending.size >= MAX_PENDING_IDS) pending.delete(pending.keys().next().value!)
    queue = []
    pending.set(event.id, queue)
  }
  if (queue.length < MAX_PENDING_EVENTS) queue.push(event)
}

export function ensureLogHub(): void {
  if (installed) return
  installed = true
  window.agentDesk.logs.onEvent(dispatch)
}

export function listen(id: string, listener: Listener): () => void {
  listeners.set(id, listener)
  const queued = pending.get(id)
  pending.delete(id)
  queued?.forEach(listener)
  return () => {
    listeners.delete(id)
    pending.delete(id)
  }
}
