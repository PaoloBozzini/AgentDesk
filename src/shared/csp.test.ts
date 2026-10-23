import { describe, expect, it } from 'vitest'
import { developmentCsp, productionCsp } from './csp'

describe('productionCsp', () => {
  const csp = productionCsp()

  it('denies by default', () => {
    expect(csp).toContain("default-src 'none'")
  })

  it('never allows inline or eval scripts', () => {
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
  })

  it('blocks remote origins', () => {
    expect(csp).not.toMatch(/https?:/)
  })
})

describe('developmentCsp', () => {
  it('allows the dev server websocket only', () => {
    const csp = developmentCsp('http://localhost:5173')
    expect(csp).toContain("connect-src 'self' ws://localhost:5173")
    expect(csp).not.toContain('unsafe-eval')
  })
})
