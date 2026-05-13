import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'

export function usePaperLiveGame(gameId) {
  const [liveState, setLiveState] = useState(null)
  const [lastKnownGoodState, setLastKnownGoodState] = useState(null)
  const [isPolling, setIsPolling] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  const [lastPollAttempt, setLastPollAttempt] = useState(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [timedOut, setTimedOut] = useState(false)

  // Loading until first snapshot arrives — but bail after 10 s so the live game
  // page can render the lobby fallback rather than showing a skeleton forever.
  const loading = lastKnownGoodState === null && !timedOut

  useEffect(() => {
    if (!gameId) return

    setIsPolling(true)
    setIsReconnecting(false)
    setTimedOut(false)

    const liveRef = ref(db, `liveSessions/${gameId}`)

    const unsub = onValue(
      liveRef,
      (snap) => {
        const data = snap.val()
        const now = new Date()
        setLiveState(data)
        setLastKnownGoodState(data)
        setLastUpdatedAt(now)
        setLastPollAttempt(now)
        setConsecutiveFailures(0)
        setIsReconnecting(false)
      },
      (err) => {
        setConsecutiveFailures(f => f + 1)
        setIsReconnecting(true)
        if (import.meta.env.DEV) console.warn('[liveSessions] error:', err.message)
      },
    )

    const loadTimer = setTimeout(() => setTimedOut(true), 10_000)

    return () => {
      unsub()
      clearTimeout(loadTimer)
      setIsPolling(false)
    }
  }, [gameId])

  return {
    liveState,
    lastKnownGoodState,
    teamId: lastKnownGoodState?.team?.id ?? null,
    isPolling,
    isReconnecting,
    lastUpdatedAt,
    lastPollAttempt,
    consecutiveFailures,
    loading,
  }
}
