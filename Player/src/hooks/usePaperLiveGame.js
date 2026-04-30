import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'

const POLL_INTERVAL = 5000
const COMPLETION_LINGER = 30_000

export function usePaperLiveGame(gameId) {
  const [liveState, setLiveState] = useState(null)
  const [lastKnownGoodState, setLastKnownGoodState] = useState(null)
  const [isPolling, setIsPolling] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const intervalRef = useRef(null)
  const completionTimerRef = useRef(null)
  const mountedRef = useRef(true)

  // True only on the very first load, before any response has arrived
  const loading = lastKnownGoodState === null

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!gameId) return

    const stopInterval = () => {
      clearInterval(intervalRef.current)
      intervalRef.current = null
      if (mountedRef.current) setIsPolling(false)
    }

    const poll = async () => {
      try {
        const data = await api.getPaperLiveState(gameId)
        if (!mountedRef.current) return

        setLiveState(data)
        setLastKnownGoodState(data)
        setLastUpdatedAt(new Date())
        setConsecutiveFailures(0)
        setIsReconnecting(false)

        // Schedule polling stop once, 30s after first completed response
        if (data.game_state === 'completed' && !completionTimerRef.current) {
          completionTimerRef.current = setTimeout(() => {
            stopInterval()
            completionTimerRef.current = null
          }, COMPLETION_LINGER)
        }
      } catch {
        if (!mountedRef.current) return
        setConsecutiveFailures(prev => prev + 1)
        setIsReconnecting(true)
      }
    }

    setIsPolling(true)
    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return () => {
      clearInterval(intervalRef.current)
      intervalRef.current = null
      clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
  }, [gameId])

  return {
    liveState,
    lastKnownGoodState,
    isPolling,
    isReconnecting,
    lastUpdatedAt,
    consecutiveFailures,
    loading,
  }
}
