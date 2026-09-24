import { defineConfig } from 'vitest/config'
// Real Player client code against the real regional (candidate) rules in the
// Firestore emulator. Run through `npm run test:integration`, never the unit run.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node', include: ['tests/integration/**/*.test.js'],
    fileParallelism: false, maxWorkers: 1, testTimeout: 20000, hookTimeout: 60000,
  },
})
