// Checks a packaged build: `npm run verify:package` (after `npm run build:mac`).
// - Electron fuses are set as electron-builder.yml says
// - app.asar holds the production CSP
// - the app starts, renders, answers IPC, and enforces the CSP (self-test mode)
// - debugging switches are refused
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses')
// The fuse wire stores ASCII '1' (enabled) / '0' (disabled)
const FUSE_ON = '1'.charCodeAt(0)
const asar = require('@electron/asar')

const EXPECTED_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'"
const EXPECTED_FUSES = {
  RunAsNode: false,
  EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
  // needed while the renderer loads from file://
  GrantFileProtocolExtraPrivileges: true
}

const apps = [
  ['arm64', 'dist/mac-arm64/Agent Desk.app', []],
  ['x64', 'dist/mac/Agent Desk.app', ['-x86_64']]
].filter(([, p]) => existsSync(p))

let failed = false
const check = (ok, what, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? `: ${detail}` : ''}`)
  if (!ok) failed = true
}

if (apps.length === 0) {
  console.error('No packaged app in dist/. Run npm run build:mac first.')
  process.exit(1)
}

for (const [arch, app, archArgs] of apps) {
  console.log(`\n== ${arch}: ${app}`)
  const binary = join(app, 'Contents/MacOS/Agent Desk')

  const wire = await getCurrentFuseWire(binary)
  for (const [name, want] of Object.entries(EXPECTED_FUSES)) {
    const state = wire[FuseV1Options[name]]
    const on = state === FUSE_ON
    check(on === want, `fuse ${name}`, on ? 'on' : 'off')
  }

  const html = asar.extractFile(join(app, 'Contents/Resources/app.asar'), 'out/renderer/index.html')
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html.toString())?.[1]
  check(csp === EXPECTED_CSP, 'app.asar CSP is the production policy')

  const run = (args, env = {}) =>
    archArgs.length
      ? spawnSync('/usr/bin/arch', [...archArgs, binary, ...args], {
          env: { ...process.env, ...env },
          encoding: 'utf8',
          timeout: 60_000
        })
      : spawnSync(binary, args, {
          env: { ...process.env, ...env },
          encoding: 'utf8',
          timeout: 60_000
        })

  const self = run([], { AGENTDESK_SELF_TEST: '1' })
  const line = self.stdout.split('\n').find((l) => l.startsWith('AGENTDESK_SELF_TEST '))
  const report = line
    ? JSON.parse(line.slice('AGENTDESK_SELF_TEST '.length))
    : { error: self.stderr.slice(0, 300) }
  check(self.status === 0 && !report.error, 'self-test ran', report.error ?? '')
  check(report.rendered === 'Agent Desk', 'renderer loaded from app.asar')
  check(report.csp === EXPECTED_CSP, 'CSP active in the page')
  check(report.inlineScriptBlocked === true, 'inline script blocked')
  check(report.nodeInRenderer === false, 'no Node globals in the renderer')
  check(
    typeof report.agents === 'number',
    'IPC answers',
    `${report.agents} agents${report.statusError ? `, status: ${report.statusError}` : ''}`
  )

  const debug = run(['--remote-debugging-port=9399'])
  check(
    debug.status === 1 && /refusing to start/.test(debug.stderr),
    'refuses --remote-debugging-port'
  )
  const runAsNode = run(['-e', 'console.log("node-ran")'], {
    ELECTRON_RUN_AS_NODE: '1',
    AGENTDESK_SELF_TEST: '1'
  })
  check(!runAsNode.stdout.includes('node-ran'), 'ELECTRON_RUN_AS_NODE ignored')
}

process.exit(failed ? 1 : 0)
