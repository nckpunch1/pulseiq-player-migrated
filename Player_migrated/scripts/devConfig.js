export const DEV_PROJECT = 'pulseiq-dev-70d82'
const firebaseKeys = ['API_KEY', 'AUTH_DOMAIN', 'DATABASE_URL', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID']

// Define every Firebase key, including missing optional values, so Player's
// production .env.local cannot leak into the isolated DEV build.
export function devFirebaseDefines(env) {
  if (env.VITE_FIREBASE_PROJECT_ID !== DEV_PROJECT) throw new Error('Player DEV requires AdminHost configuration for pulseiq-dev-70d82.')
  for (const key of ['API_KEY', 'AUTH_DOMAIN', 'APP_ID']) {
    if (!env[`VITE_FIREBASE_${key}`]) throw new Error(`AdminHost DEV configuration is missing ${key}.`)
  }
  if (env.VITE_FIREBASE_AUTH_DOMAIN !== `${DEV_PROJECT}.firebaseapp.com`) throw new Error('AdminHost DEV auth domain does not match the DEV project.')
  return Object.fromEntries(firebaseKeys.map(key => [
    `import.meta.env.VITE_FIREBASE_${key}`, JSON.stringify(env[`VITE_FIREBASE_${key}`] || ''),
  ]))
}
