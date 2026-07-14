import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// The '@/' alias mirrors tsconfig.json paths ("@/*" -> "./src/*"). Node
// environment — these are pure logic/unit tests, no DOM.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
