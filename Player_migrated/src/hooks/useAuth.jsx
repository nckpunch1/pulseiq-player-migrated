import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, firestore } from '../lib/firebase'
import { api } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [player, setPlayer] = useState(null)
  const [isCaptain, setIsCaptain] = useState(false)
  const [loading, setLoading] = useState(true)
  const [requiresVerification, setRequiresVerification] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(firestore, 'users', firebaseUser.uid))
          const ud = snap.exists() ? snap.data() : {}
          const isVerified = firebaseUser.emailVerified || ud.manuallyVerified === true
          setRequiresVerification(!isVerified)
          setPlayer({
            id: firebaseUser.uid,
            email: ud.email ?? null,
            display_name: ud.displayName ?? '',
            username: ud.username ?? '',
            first_name: ud.firstName ?? '',
            last_name: ud.lastName ?? '',
          })
          setUser(firebaseUser)
        } catch {
          // Firestore unavailable (network drop or iOS private mode) — honour the
          // Firebase Auth session so the user isn't kicked to /login just because
          // Firestore couldn't be reached. Profile fields will be blank until refresh.
          setRequiresVerification(!firebaseUser.emailVerified)
          setPlayer({
            id: firebaseUser.uid,
            email: firebaseUser.email ?? null,
            display_name: firebaseUser.displayName ?? '',
            username: '',
            first_name: '',
            last_name: '',
          })
          setUser(firebaseUser)
        }
      } else {
        setUser(null)
        setPlayer(null)
        setIsCaptain(false)
        setRequiresVerification(false)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const setSessionFromResponse = useCallback((data) => {
    if (data?.player) {
      setPlayer(prev => ({ ...(prev ?? {}), ...data.player }))
    }
    if (data?.membership !== undefined) {
      setIsCaptain(data.membership?.is_captain ?? false)
    }
    if (data?.requiresVerification !== undefined) {
      setRequiresVerification(data.requiresVerification)
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const data = await api.login(credentials)
    setSessionFromResponse(data)
    return data
  }, [setSessionFromResponse])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
      setPlayer(null)
      setIsCaptain(false)
      setRequiresVerification(false)
    }
  }, [])

  // Block render while Firebase resolves initial auth state to prevent flash to /login
  if (loading) return null

  const token = user?.uid ?? null
  const isLoggedIn = Boolean(user)

  return (
    <AuthContext.Provider value={{ player, token, isCaptain, isLoggedIn, loading, requiresVerification, login, logout, setSessionFromResponse }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
