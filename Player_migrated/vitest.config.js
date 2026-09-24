import { defineConfig } from 'vitest/config'
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node', clearMocks: true,
    // Emulator-backed journeys run separately: npm run test:integration.
    exclude: ['**/node_modules/**', 'tests/integration/**'],
    coverage: {
      thresholds: { statements: 82, lines: 82, branches: 85, functions: 89 },
      provider: 'v8', reporter: ['text', 'html', 'json-summary'],
      include: ['src/api/{firebaseClient,cache,inviteEmail}.js', 'src/hooks/useAuth.jsx', 'src/hooks/{usePaperLiveGame,usePulseSession}.js', 'src/lib/regionAccess.js'],
    },
  },
})
