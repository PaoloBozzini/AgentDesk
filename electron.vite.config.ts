import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { developmentCsp, productionCsp } from './src/shared/csp'

function cspPlugin(): Plugin {
  let csp = productionCsp()
  return {
    name: 'agent-desk-csp',
    configureServer(server) {
      const { port = 5173 } = server.config.server
      csp = developmentCsp(`http://localhost:${port}`)
    },
    transformIndexHtml(html) {
      if (!html.includes('%AGENT_DESK_CSP%')) {
        throw new Error('index.html is missing the %AGENT_DESK_CSP% placeholder')
      }
      return html.replace('%AGENT_DESK_CSP%', csp)
    }
  }
}

export default defineConfig({
  main: {
    build: {
      // plist is ESM-only with no "require" export: bundle it into the CJS main build
      externalizeDeps: { exclude: ['plist'] }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), cspPlugin()]
  }
})
