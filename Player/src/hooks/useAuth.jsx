import { createContext, useContext, useState, useCallback } from 'react'
import { getSession, setSession, clearSession, api } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(() => getSession())

  const player = session?.player ?? null
  const token = session?.player_session_token ?? null
  const isCaptain = session?.is_captain ?? false
  const isLoggedIn = Boolean(token)

  // Accepts the data payload from login, register, or me responses and
  // merges into the stored session. Membership fields update is_captain.
  const setSessionFromResponse = useCallback((data) => {
    const current = getSession() ?? {}
    const next = {
      ...current,
      ...(data.player !== undefined && { player: data.player }),
      ...(data.player_session_token !== undefined && { player_session_token: data.player_session_token }),
      ...(data.expires_at !== undefined && { expires_at: data.expires_at }),
      ...(data.membership !== undefined && { is_captain: data.membership?.is_captain ?? false }),
    }
    setSession(next)
    setSessionState(next)
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
      clearSession()
      setSessionState(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ player, token, isCaptain, isLoggedIn, login, logout, setSessionFromResponse }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
