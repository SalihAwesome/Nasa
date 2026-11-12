import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'

const sharedDir = fileURLToPath(new URL('../shared', import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), sharedDir],
    },
  },
})
