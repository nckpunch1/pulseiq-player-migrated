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

  const loading = lastKnownGoodState === null

  useEffect(() => {
    if (!gameId) return

    setIsPolling(true)
    setIsReconnecting(false)

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

    return () => {
      unsub()
      setIsPolling(false)
    }
  }, [gameId])

  return {
    liveState,
    lastKnownGoodState,
    isPolling,
    isReconnecting,
    lastUpdatedAt,
    lastPollAttempt,
    consecutiveFailures,
    loading,
  }
}
