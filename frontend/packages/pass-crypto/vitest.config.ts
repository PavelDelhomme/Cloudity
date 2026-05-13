import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Argon2id en WASM peut prendre ~50-200 ms au premier appel ; un peu de marge.
    testTimeout: 15000,
  },
})
