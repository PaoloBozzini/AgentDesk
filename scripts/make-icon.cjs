// Renders build/icon.svg to build/icon.png (1024 px) with Electron, then
// builds build/icon.icns with sips + iconutil. Run: npm run icon
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const BUILD = path.join(__dirname, '..', 'build')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  try {
    const svg = fs.readFileSync(path.join(BUILD, 'icon.svg'), 'utf8')
    const win = new BrowserWindow({
      width: 1024,
      height: 1024,
      show: false,
      transparent: true,
      frame: false,
      webPreferences: { offscreen: true, javascript: false }
    })
    const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await new Promise((r) => setTimeout(r, 300))
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
    const png = image.resize({ width: 1024, height: 1024 }).toPNG()
    fs.writeFileSync(path.join(BUILD, 'icon.png'), png)

    const iconset = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdesk-icon-')) + '/icon.iconset'
    fs.mkdirSync(iconset)
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        const px = size * scale
        const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`
        execFileSync(
          '/usr/bin/sips',
          [
            '-z',
            String(px),
            String(px),
            path.join(BUILD, 'icon.png'),
            '--out',
            path.join(iconset, name)
          ],
          { stdio: 'ignore' }
        )
      }
    }
    execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(BUILD, 'icon.icns')])
    fs.rmSync(path.dirname(iconset), { recursive: true, force: true })
    console.log('icon.png + icon.icns written')
    app.exit(0)
  } catch (e) {
    console.error(e)
    app.exit(1)
  }
})
