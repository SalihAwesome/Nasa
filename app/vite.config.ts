import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { loadEnv, searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'
import { projectAssistant } from './server/projectAssistant.ts'
import { googleMapsBrowserKey } from './google-maps.config.ts'

const sharedDir = fileURLToPath(new URL('../shared', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('./', import.meta.url)), 'OPENAI_')
  const maps = loadEnv(mode, fileURLToPath(new URL('./', import.meta.url)), 'VITE_')
  // The default build stays offline (U10). VITE_GOOGLE_MAPS=on opts in to Google imagery.
  const mapsKey = maps.VITE_GOOGLE_MAPS === 'on' ? maps.VITE_GOOGLE_MAPS_API_KEY || googleMapsBrowserKey : ''
  return {
    plugins: [react(), projectAssistant({ key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL })],
    base: './',
    define: mode === 'test' ? {} : {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(mapsKey),
    },
    // Local Maps credentials must not change the existing offline test fixtures.
    // Google integration behavior is verified separately in a browser.
    test: { env: { VITE_GOOGLE_MAPS_API_KEY: '' } },
    server: {
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd()), sharedDir],
      },
    },
  }
})
