import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore'
// import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
// initializeAppCheck(app, {
//   provider: new ReCaptchaEnterpriseProvider('6LcVHOwsAAAAAMZQhmx3tku6CUrnDiTvm08fpJ3u'),
//   isTokenAutoRefreshEnabled: true,
// })
export const db = getDatabase(app)
export const auth = getAuth(app)
// memoryLocalCache avoids IndexedDB, which fails on iOS Safari private mode and
// low-storage devices — persistentLocalCache was blocking Firestore init on phones
export const firestore = initializeFirestore(app, {
  localCache: memoryLocalCache()
})
