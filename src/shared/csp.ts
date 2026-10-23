/**
 * Content Security Policy for the renderer. The production policy is strict;
 * the dev policy only adds what the Vite dev server needs (HMR websocket and
 * the inline react-refresh preamble).
 */

const PROD_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'object-src': ["'none'"]
}

function serialize(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

export function productionCsp(): string {
  return serialize(PROD_DIRECTIVES)
}

export function developmentCsp(devServerOrigin: string): string {
  const ws = devServerOrigin.replace(/^http/, 'ws')
  return serialize({
    ...PROD_DIRECTIVES,
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'connect-src': ["'self'", ws]
  })
}
