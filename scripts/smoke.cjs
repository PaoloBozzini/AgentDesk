// Smoke test for the built app: `electron -r ./scripts/smoke.cjs .`
// Fails (exit 1) if the main process throws, the renderer doesn't load, or the
// preload API doesn't answer. Read-only: never writes anything.
const { app } = require('electron')

const TIMEOUT_MS = 30000
const fail = (msg) => {
  console.error(`[smoke] FAIL: ${msg}`)
  app.exit(1)
}

process.on('uncaughtException', (e) => fail(`uncaught exception in main: ${e.stack || e}`))
setTimeout(() => fail(`no result within ${TIMEOUT_MS} ms`), TIMEOUT_MS).unref()

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('preload-error', (_ev, path, error) =>
    fail(`preload error in ${path}: ${error}`)
  )
  win.webContents.on('render-process-gone', (_ev, details) =>
    fail(`renderer gone: ${details.reason}`)
  )
  win.webContents.on('did-fail-load', (_ev, code, desc) => fail(`load failed: ${code} ${desc}`))
  win.webContents.on('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => ({
        isolated: typeof window.require === 'undefined' && typeof window.process === 'undefined',
        inlineBlocked: await new Promise((resolve) => {
          const s = document.createElement('script')
          s.textContent = 'window.__smokeInline = 1'
          document.head.appendChild(s)
          setTimeout(() => resolve(window.__smokeInline !== 1), 100)
        }),
        info: await window.agentDesk.app.getInfo(),
        agents: (await window.agentDesk.agents.list()).agents.length
      }))()`)
      if (!result.isolated) return fail('renderer can see Node globals')
      if (!result.inlineBlocked) return fail('CSP did not block an inline script')
      if (!result.info || !result.info.version) return fail('app.getInfo() returned nothing')
      console.log(
        `[smoke] OK: ${result.info.name} ${result.info.version}, ${result.agents} agents listed`
      )
      app.exit(0)
    } catch (e) {
      fail(`renderer check threw: ${e}`)
    }
  })
})
