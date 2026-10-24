# Agent Desk

A macOS app for the jobs in `~/Library/LaunchAgents`: see what's loaded and running, read their logs, create, edit and delete them, without hand-editing plists or remembering `launchctl` syntax.

- **List** every user agent with launchd's live state (loaded, running, PID, last exit), filter by status, search by label. System agents and daemons can be shown read-only.
- **Inspect** an agent: its keys, the raw XML, live `stdout` / `stderr` tails and the unified system log (`log show` / live `log stream`).
- **Control** it: load, unload, start, restart, reload, enable, disable. Failures explain what went wrong and show the exact `launchctl` command.
- **Create** an agent from a template (run at login, every N minutes, on a schedule, when a path changes, keep alive) with a form or raw XML.
- **Edit** in the form or the XML editor, review a diff, save. The old file is backed up first; if the agent is loaded you're offered a reload.
- **Delete** safely: unloaded, backed up, moved to the Trash.

Requires macOS 12 or later (Apple silicon or Intel).

## Install

[Build the package](#build-a-package), then open the `.dmg` for your Mac (`arm64` = Apple silicon, `x64` = Intel) and drag **Agent Desk** to Applications.

The app is ad-hoc signed, not notarized, so macOS asks once: right-click **Agent Desk** → **Open** → **Open** (or System Settings → Privacy & Security → **Open Anyway**). Alternatively:

```sh
xattr -dr com.apple.quarantine "/Applications/Agent Desk.app"
```

## Usage

|           |                                                 |
| --------- | ----------------------------------------------- |
| **⌘N**    | New agent                                       |
| **⌘F**    | Search labels                                   |
| **⌘R**    | Refresh                                         |
| **↑ / ↓** | Move through the list                           |
| **Esc**   | Clear search / close the panel / close a dialog |

- **Status filters** (All, Loaded, Running, Failed, Not loaded) sit under the toolbar. _Show system agents_ adds `/Library/LaunchAgents` and `/Library/LaunchDaemons`, read-only.
- Select an agent for its details. The action buttons only offer what makes sense for its state.
- **New agent**: pick a template; the label is suggested as `com.<you>.<name>` and logs go to `~/Library/Logs/<label>/`. The file is checked with `plutil -lint` and written as `~/Library/LaunchAgents/<Label>.plist` (an existing file is never overwritten). Tick _Load now_ to start it right away.
- **Edit…**: switch between **Form** and **XML** at any time; keys the form doesn't know are kept as they are. **Review changes…** shows a side-by-side diff before saving. The Label can't be changed (it's the file name and launchd's identity).
- **Delete…** shows the label and full path, then unloads, backs up and moves the file to the Trash.
- **Backups** opens `~/Library/Application Support/Agent Desk/backups/`, where every edited or deleted file is copied first (`<label>/<timestamp>.plist`).

## Security model

Agent Desk only writes inside `~/Library/LaunchAgents`, `~/Library/Application Support/Agent Desk` and `~/Library/Logs` (symlinks resolved, everything else refused), never deletes a file outright, runs `launchctl` / `plutil` / `log` with argument arrays (never a shell), and treats system agents as read-only. The renderer is sandboxed with a strict CSP and talks to the main process only through a small, validated IPC API. The packaged app has Electron's Node entry points fused off and refuses debugging switches.

Details, and how each of these is enforced in CI: [docs/security.md](docs/security.md).

## Development

Requirements: macOS, Node.js 22, npm.

```sh
npm ci
npm run dev          # app with hot reload
```

| Command                           |                                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                        | Unit tests (Vitest)                                                                                                        |
| `npm run lint`                    | ESLint, including the security rules (no shell exec, writes only in audited services)                                      |
| `npm run typecheck`               | TypeScript, main + renderer                                                                                                |
| `npm run format` / `format:check` | Prettier                                                                                                                   |
| `npm run smoke`                   | Builds and starts the app once, checks the renderer is isolated, the CSP blocks inline scripts and IPC answers. Read-only. |
| `npm run test:integration`        | Integration tests against the real launchd (see below)                                                                     |
| `npm run build:mac`               | Package (see below)                                                                                                        |
| `npm run verify:package`          | Check a packaged build (fuses, CSP, self-test, debug switches refused)                                                     |

Project layout:

```
src/main/        Electron main: IPC handlers, services (launchctl, plist, logs, create/save/delete, backups, paths)
src/preload/     The window.agentDesk bridge
src/renderer/    React UI
src/shared/      Types and pure logic used on both sides (IPC contract, form model, templates, label rules)
scripts/         smoke test, icon renderer, package verifier
```

### Integration tests

`npm test` never touches launchd. The integration tests do, so they are opt-in:

```sh
npm run test:integration    # sets AGENTDESK_INTEGRATION=1
```

They are built to be safe on your own Mac:

- every label is `com.agentdesk.test.int.<name>`, and every `launchctl` call goes through a guard that blocks any other label, the system domain and paths outside the test's temp folder;
- plists live in a temp folder, never in `~/Library/LaunchAgents`;
- afterwards every test agent is booted out and the folder deleted.

One side effect can't be undone without `sudo`: `launchctl enable` / `disable` leave a permanent entry for that label in launchd's override database. The tests reuse a fixed set of label names, so this is a handful of inert `com.agentdesk.test.int.*` entries, not a growing list.

### Build a package

```sh
npm run build:mac
npm run verify:package
```

Produces `dist/agent-desk-<version>-{arm64,x64}.dmg` and `-mac.zip`, ad-hoc signed. Signing with a Developer ID and notarizing are optional: [docs/packaging.md](docs/packaging.md).
