import { defineConfig } from 'vitest/config'
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node', clearMocks: true,
    coverage: {
      thresholds: { statements: 82, lines: 82, branches: 85, functions: 89 },
      provider: 'v8', reporter: ['text', 'html', 'json-summary'],
      include: ['src/api/{firebaseClient,cache,inviteEmail}.js', 'src/hooks/useAuth.jsx', 'src/lib/regionAccess.js'],
    },
  },
})
