# Packaging

```sh
npm run build:mac      # typecheck + build + package
```

Output in `dist/`:

| File                                                  | What                                |
| ----------------------------------------------------- | ----------------------------------- |
| `agent-desk-<version>-arm64.dmg` / `-x64.dmg`         | Disk images (Apple silicon / Intel) |
| `agent-desk-<version>-arm64-mac.zip` / `-x64-mac.zip` | Zipped `.app`                       |

Configuration: `electron-builder.yml` (app id `com.paolobozzini.agentdesk`, product name Agent Desk, macOS 12+).

## Icon

`build/icon.svg` is the source. `npm run icon` renders it with Electron to `build/icon.png` (1024 px) and builds `build/icon.icns` with `sips` + `iconutil`.

## Signing (optional)

By default the app is **ad-hoc signed** (`identity: '-'`). That's enough for it to run on any Mac, but Gatekeeper does not trust it, so on first launch of a downloaded copy:

- right-click the app → **Open** → **Open** (on newer macOS: System Settings → Privacy & Security → **Open Anyway**), or
- `xattr -dr com.apple.quarantine "/Applications/Agent Desk.app"`

### Developer ID + notarization

With an Apple Developer account:

1. Set a real identity: `CSC_NAME="Developer ID Application: Your Name (TEAMID)"` (or `CSC_LINK` + `CSC_KEY_PASSWORD` for a .p12).
2. In `electron-builder.yml` remove `identity: '-'`, set `hardenedRuntime: true` (entitlements are in `build/entitlements.mac.plist`: only `allow-jit`) and `notarize: true`.
3. Provide notarization credentials, e.g. `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
4. `npm run build:mac`

## Checking a build

```sh
codesign --verify --deep --strict "dist/mac-arm64/Agent Desk.app"
lipo -archs "dist/mac/Agent Desk.app/Contents/MacOS/Agent Desk"   # x86_64
```
