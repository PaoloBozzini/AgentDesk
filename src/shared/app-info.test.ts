import { describe, expect, it } from 'vitest'
import { APP_ID, APP_NAME } from './app-info'

describe('app-info', () => {
  it('exposes the app identity', () => {
    expect(APP_NAME).toBe('Agent Desk')
    expect(APP_ID).toBe('com.paolobozzini.agentdesk')
  })
})
