import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Separate from vite.config.ts: vitest@3.2.7's `test` config option doesn't
// type-merge into vite@8's UserConfig (rolldown-vite) overloads, so folding
// this into vite.config.ts's defineConfig() fails to typecheck. Vitest picks
// this file up on its own — it does not need to import/merge vite.config.ts,
// since none of the tests need the react/tailwind plugins, only the `@`
// alias the rest of the app uses.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'happy-dom',
  },
})
