import { app, type WebContents } from 'electron'
import { killAllChildrenNow, ProcessRegistry } from './processes'

/** App-wide registry of per-window subscriptions (log tails, log stream children). */
export const registry = new ProcessRegistry()

const tracked = new WeakSet<WebContents>()

/** Release everything a webContents owns when it goes away or reloads. */
export function trackOwner(contents: WebContents): void {
  if (tracked.has(contents)) return
  tracked.add(contents)
  const id = contents.id
  const release = (): void => registry.disposeOwner(id)
  contents.once('destroyed', release)
  contents.on('render-process-gone', release)
  contents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) release()
  })
}

export function installQuitCleanup(): void {
  app.on('before-quit', () => registry.disposeAll())
  process.once('exit', killAllChildrenNow)
}
