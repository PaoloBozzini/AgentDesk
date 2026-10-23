import { app, session, shell, type WebContents } from 'electron'
import { isAllowedExternalUrl } from './policy'

/**
 * App-wide hardening. Must be called before `app.whenReady()`.
 */
export function hardenApp(): void {
  app.enableSandbox()

  app.on('web-contents-created', (_event, contents) => hardenWebContents(contents))

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
      callback(false)
    )
    session.defaultSession.setPermissionCheckHandler(() => false)
  })
}

function hardenWebContents(contents: WebContents): void {
  contents.on('will-attach-webview', (event) => event.preventDefault())

  contents.on('will-navigate', (event, url) => {
    if (url !== contents.getURL()) event.preventDefault()
  })

  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
}
