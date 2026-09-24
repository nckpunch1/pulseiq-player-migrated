import { useState, useEffect, useMemo } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'

const emptyState = {
  liveState: null,
  lastKnownGoodState: null,
  isReconnecting: false,
  lastUpdatedAt: null,
  lastPollAttempt: null,
  consecutiveFailures: 0,
  timedOut: false,
}

export function usePaperLiveGame(gameId) {
  // A new identity also distinguishes returning to a previously visited game.
  // Old snapshots are hidden during render, before effect cleanup/setup runs.
  const subscription = useMemo(() => ({ gameId }), [gameId])
  const [snapshot, setSnapshot] = useState(null)
  const state = snapshot?.subscription === subscription ? snapshot.state : emptyState

  useEffect(() => {
    if (!gameId) return
    let active = true
    let current = emptyState
    const publish = patch => {
      current = { ...current, ...patch }
      setSnapshot({ subscription, state: current })
    }
    const liveRef = ref(db, `liveSessions/${gameId}`)
    const unsub = onValue(
      liveRef,
      (snap) => {
        if (!active) return
        const data = snap.val()
        const now = new Date()
        publish({
          liveState: data,
          lastKnownGoodState: data,
          lastUpdatedAt: now,
          lastPollAttempt: now,
          consecutiveFailures: 0,
          isReconnecting: false,
        })
      },
      (err) => {
        if (!active) return
        publish({ consecutiveFailures: current.consecutiveFailures + 1, isReconnecting: true })
        if (import.meta.env.DEV) console.warn('[liveSessions] error:', err.message)
      },
    )

    // A fresh ten-second fallback for each game; errors within that game keep
    // its last good snapshot available while the subscription reconnects.
    const loadTimer = setTimeout(() => publish({ timedOut: true }), 10_000)
    return () => {
      active = false
      unsub()
      clearTimeout(loadTimer)
    }
  }, [gameId, subscription])

  return {
    liveState: state.liveState,
    lastKnownGoodState: state.lastKnownGoodState,
    teamId: state.lastKnownGoodState?.team?.id ?? null,
    isPolling: !!gameId,
    isReconnecting: state.isReconnecting,
    lastUpdatedAt: state.lastUpdatedAt,
    lastPollAttempt: state.lastPollAttempt,
    consecutiveFailures: state.consecutiveFailures,
    loading: !!gameId && state.lastKnownGoodState === null && !state.timedOut,
  }
}
