import { expect, it } from 'vitest'
import { devFirebaseDefines, DEV_PROJECT } from '../scripts/devConfig'
const env = { VITE_FIREBASE_PROJECT_ID: DEV_PROJECT, VITE_FIREBASE_API_KEY: 'dev-key', VITE_FIREBASE_AUTH_DOMAIN: `${DEV_PROJECT}.firebaseapp.com`, VITE_FIREBASE_APP_ID: 'dev-app' }
it('reuses all AdminHost Firebase settings and clears absent optional production values', () => {
  const defs = devFirebaseDefines(env)
  expect(defs['import.meta.env.VITE_FIREBASE_PROJECT_ID']).toBe(JSON.stringify(DEV_PROJECT))
  expect(defs['import.meta.env.VITE_FIREBASE_API_KEY']).toBe('"dev-key"')
  expect(defs['import.meta.env.VITE_FIREBASE_DATABASE_URL']).toBe('""')
  expect(Object.keys(defs)).toHaveLength(7)
})
it('refuses production, missing config and a mismatched auth domain', () => {
  for (const override of [{ VITE_FIREBASE_PROJECT_ID: 'pulseiqadmin' }, { VITE_FIREBASE_API_KEY: '' }, { VITE_FIREBASE_AUTH_DOMAIN: 'pulseiqadmin.firebaseapp.com' }]) {
    expect(() => devFirebaseDefines({ ...env, ...override })).toThrow()
  }
})
