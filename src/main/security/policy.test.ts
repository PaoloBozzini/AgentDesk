import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl, isTrustedRendererUrl } from './policy'

describe('isAllowedExternalUrl', () => {
  it.each([
    ['https://github.com/PaoloBozzini/AgentDesk', true],
    ['http://github.com/', false],
    ['https://github.com.evil.com/', false],
    ['https://evil.com/?q=github.com', false],
    ['file:///etc/passwd', false],
    ['javascript:alert(1)', false],
    ['not a url', false]
  ])('%s -> %s', (url, expected) => {
    expect(isAllowedExternalUrl(url)).toBe(expected)
  })
})

describe('isTrustedRendererUrl', () => {
  const rendererIndexPath =
    '/Applications/Agent Desk.app/Contents/Resources/app.asar/out/renderer/index.html'

  it('accepts the bundled index in production', () => {
    const url = 'file://' + encodeURI(rendererIndexPath)
    expect(isTrustedRendererUrl(url, { rendererIndexPath })).toBe(true)
  })

  it('rejects other file urls in production', () => {
    expect(isTrustedRendererUrl('file:///tmp/evil.html', { rendererIndexPath })).toBe(false)
  })

  it('rejects http in production', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/', { rendererIndexPath })).toBe(false)
  })

  it('accepts only the dev server origin in development', () => {
    const opts = { rendererIndexPath, devServerUrl: 'http://localhost:5173' }
    expect(isTrustedRendererUrl('http://localhost:5173/index.html', opts)).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:5174/', opts)).toBe(false)
    expect(isTrustedRendererUrl('https://evil.com/', opts)).toBe(false)
  })

  it('rejects garbage', () => {
    expect(isTrustedRendererUrl('', { rendererIndexPath })).toBe(false)
  })
})
