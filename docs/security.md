# Security model

Agent Desk edits files that macOS runs at login, so the app is built to do as little as possible with as few ways in as possible.

## What it can touch

|                   |                                                                                                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Writes**        | Only inside `~/Library/LaunchAgents`, `~/Library/Application Support/Agent Desk` (backups, temp files) and `~/Library/Logs`. Every write resolves real paths (following symlinks in the target and all its parents) and is refused outside those folders (`src/main/services/paths.ts`). |
| **System agents** | `/Library/LaunchAgents` and `/Library/LaunchDaemons` are listed read-only. No edit, delete or launchctl action is offered or accepted for them.                                                                                                                                          |
| **Deletes**       | Never `unlink`: the file is backed up, then moved to the Trash (`shell.trashItem`).                                                                                                                                                                                                      |
| **Edits**         | Backup first; a failed backup aborts. Saves are refused if the file changed since it was opened. Atomic replace (temp file + rename). Symlinked plists are not replaced.                                                                                                                 |
| **Processes**     | `launchctl`, `plutil`, `log` by absolute path, with argument arrays (`execFile` / `spawn`, never a shell). Labels are validated before they reach an argument (`src/shared/label.ts`).                                                                                                   |
| **Network**       | None. The CSP has no remote origins; links can only open allowlisted https hosts in the browser.                                                                                                                                                                                         |

## Process boundary

- Renderer: `contextIsolation`, `sandbox`, no Node integration, no `webview`, navigation and new windows blocked, all permission requests denied.
- The renderer only sees `window.agentDesk` (preload), typed in `src/shared/ipc-contract.ts`.
- Every IPC handler first checks the sender is our own page, then validates its arguments; paths from the renderer are only accepted if they sit directly in a known agent folder; plist content is re-validated in main (the form's checks are not trusted).
- CSP (production): `default-src 'none'; script-src 'self'; style-src 'self'; …`. No `unsafe-inline` anywhere; the XML editor runs in a shadow root so its styles don't need it.

## Packaged build

- Electron fuses: `RunAsNode` off, `NODE_OPTIONS` and `--inspect` off, ASAR integrity validation on, load only from `app.asar`, cookie encryption on. (`GrantFileProtocolExtraPrivileges` stays on because the renderer is loaded from `file://`.)
- The packaged app exits if started with DevTools / inspector switches (`--remote-debugging-port`, `--inspect`, …).

## How it's enforced

| Check                                                                                                                          | Where                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| No `exec` / `execSync` / `shell: true`                                                                                         | ESLint (`eslint.config.mjs`), CI             |
| fs write APIs only in the audited services (`backup`, `create`, `logDirs`, `plutil`, `save`), each behind `assertWritablePath` | ESLint, CI                                   |
| Every IPC channel has a handler, refuses untrusted senders, survives hostile arguments without writing outside its sandbox     | `src/main/ipc/register.test.ts`, CI          |
| CSP blocks inline scripts, no Node in the renderer                                                                             | `npm run smoke`, CI                          |
| Fuses, CSP inside `app.asar`, CSP active, debug switches refused, `ELECTRON_RUN_AS_NODE` ignored                               | `npm run verify:package` on a packaged build |
| Integration tests only touch `com.agentdesk.test.*` labels and a temp folder                                                   | `src/main/services/__integration__/guard.ts` |
