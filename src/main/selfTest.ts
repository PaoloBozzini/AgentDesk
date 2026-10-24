import { app, type BrowserWindow } from 'electron'

/**
 * `AGENTDESK_SELF_TEST=1`: once the window has loaded, print what a packaged
 * build must guarantee (renderer isolated, CSP enforced, IPC answering) as one
 * JSON line and quit. Read-only; used by scripts/verify-package.mjs, since a
 * packaged build refuses DevTools debugging switches.
 */
export function runSelfTestIfRequested(window: BrowserWindow): void {
  if (process.env.AGENTDESK_SELF_TEST !== '1') return
  window.webContents.once('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 1500))
    try {
      const report = await window.webContents.executeJavaScript(`(async () => {
        let violation = false
        document.addEventListener('securitypolicyviolation', () => (violation = true))
        const s = document.createElement('script')
        s.textContent = 'window.__selfTestInline = 1'
        document.head.appendChild(s)
        await new Promise((r) => setTimeout(r, 200))
        const list = await window.agentDesk.agents.list()
        return {
          csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null,
          inlineScriptBlocked: window.__selfTestInline !== 1 && violation,
          nodeInRenderer: typeof require !== 'undefined' || typeof process !== 'undefined',
          rendered: document.querySelector('.toolbar h1')?.textContent ?? null,
          agents: list.agents.length,
          statusError: list.statusError ?? null
        }
      })()`)
      console.log(`AGENTDESK_SELF_TEST ${JSON.stringify(report)}`)
      app.exit(0)
    } catch (e) {
      console.log(`AGENTDESK_SELF_TEST ${JSON.stringify({ error: String(e) })}`)
      app.exit(1)
    }
  })
}
