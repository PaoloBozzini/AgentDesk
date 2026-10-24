/**
 * Chromium / Node switches that open a debugging channel into the app. A
 * packaged build refuses to start with any of them: another local process
 * could otherwise drive the app (and its write access) over DevTools.
 * The Node inspect flags are also disabled by Electron fuses at package time.
 */
export const DEBUG_SWITCHES = [
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-allow-origins',
  'inspect',
  'inspect-brk',
  'inspect-port',
  'inspect-publish-uid'
] as const

export function debugSwitchesIn(hasSwitch: (name: string) => boolean): string[] {
  return DEBUG_SWITCHES.filter((s) => hasSwitch(s))
}
