/**
 * Pure security decisions, kept free of Electron imports so they can be unit tested.
 */

const EXTERNAL_HOST_ALLOWLIST = new Set(['github.com'])

/** Only https links to allowlisted hosts may leave the app via shell.openExternal. */
export function isAllowedExternalUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  return url.protocol === 'https:' && EXTERNAL_HOST_ALLOWLIST.has(url.hostname)
}

/**
 * IPC must come from our own renderer: the dev server origin in development,
 * or the bundled index.html in production.
 */
export function isTrustedRendererUrl(
  raw: string,
  opts: { devServerUrl?: string; rendererIndexPath: string }
): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (opts.devServerUrl) {
    return url.origin === new URL(opts.devServerUrl).origin
  }
  if (url.protocol !== 'file:') return false
  return decodeURIComponent(url.pathname) === opts.rendererIndexPath
}
