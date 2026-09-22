import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { devFirebaseDefines } from './scripts/devConfig'

export default defineConfig(({ mode }) => {
  const isolatedDev = mode === 'dev-testing'
  const adminRoot = fileURLToPath(new URL('../../admin-host/', import.meta.url))
  return {
    plugins: [react()],
    ...(isolatedDev ? {
      define: devFirebaseDefines(loadEnv('development', adminRoot, 'VITE_FIREBASE_')),
      build: { outDir: 'dist-dev' },
      server: { host: '127.0.0.1', port: 5174, strictPort: true },
    } : {}),
  }
})
