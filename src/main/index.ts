import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { APP_ID } from '../shared/app-info'
import { hardenApp } from './security/harden'
import { registerIpcHandlers } from './ipc/register'
import { installQuitCleanup } from './services/registry'
import { userAgentsDir } from './services/agents'
import { FolderWatcher } from './services/watcher'
import { IpcEvent } from '../shared/ipc-contract'

hardenApp()
installQuitCleanup()

/** Matches --bg in base.css, so there's no white flash before the page paints. */
const windowBackground = (): string => (nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f6f6f7')

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    backgroundColor: windowBackground(),
    width: 1100,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false
    }
  })

  const onTheme = (): void => {
    if (!mainWindow.isDestroyed()) mainWindow.setBackgroundColor(windowBackground())
  }
  nativeTheme.on('updated', onTheme)
  mainWindow.on('closed', () => nativeTheme.off('updated', onTheme))

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  const watcher = new FolderWatcher(userAgentsDir(), () => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send(IpcEvent.AgentsChanged)
  })
  watcher.start()
  mainWindow.on('closed', () => watcher.stop())
  app.once('before-quit', () => watcher.stop())

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId(APP_ID)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
