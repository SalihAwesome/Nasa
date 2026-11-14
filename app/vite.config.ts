import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { loadEnv, searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'
import { projectAssistant } from './server/projectAssistant.ts'

const sharedDir = fileURLToPath(new URL('../shared', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('./', import.meta.url)), 'OPENAI_')
  return {
    plugins: [react(), projectAssistant({ key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL })],
    base: './',
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
