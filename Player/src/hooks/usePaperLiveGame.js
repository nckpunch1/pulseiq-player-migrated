import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'

const BASE_INTERVAL = 5_000
const COMPLETION_LINGER = 30_000

function backoffInterval(failures) {
  if (failures >= 4) return 15_000
  if (failures === 3) return 12_000
  if (failures === 2) return 8_000
  return 5_000  // 0 or 1 failure
}

export function usePaperLiveGame(gameId) {
  const [liveState, setLiveState] = useState(null)
  const [lastKnownGoodState, setLastKnownGoodState] = useState(null)
  const [isPolling, setIsPolling] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  const [lastPollAttempt, setLastPollAttempt] = useState(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const completionTimerRef = useRef(null)
  const mountedRef = useRef(true)

  const loading = lastKnownGoodState === null

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!gameId) return

    let stopped = false
    let timeoutId = null
    let failures = 0
    let pollCount = 0

    const stopPolling = () => {
      stopped = true
      clearTimeout(timeoutId)
      if (mountedRef.current) setIsPolling(false)
    }

    const schedule = (delay) => {
      timeoutId = setTimeout(doPoll, delay)
    }

    async function doPoll() {
      if (stopped) return

      const attempt = ++pollCount
      if (mountedRef.current) setLastPollAttempt(new Date())

      try {
        const data = await api.getPaperLiveState(gameId)
        if (stopped || !mountedRef.current) return

        failures = 0
        setLiveState(data)
        setLastKnownGoodState(data)
        setLastUpdatedAt(new Date())
        setConsecutiveFailures(0)
        setIsReconnecting(false)

        if (import.meta.env.DEV) {
          console.log('[poll]', { attempt, gameId, live_state: data?.game?.live_state })
        }

        if (data.game?.live_state === 'finished' && !completionTimerRef.current) {
          completionTimerRef.current = setTimeout(() => {
            stopPolling()
            completionTimerRef.current = null
          }, COMPLETION_LINGER)
        }

        if (!stopped) schedule(BASE_INTERVAL)
      } catch {
        if (stopped || !mountedRef.current) return

        failures++
        setConsecutiveFailures(failures)
        setIsReconnecting(true)

        if (import.meta.env.DEV) {
          console.log('[poll]', { attempt, gameId, live_state: undefined })
        }

        if (!stopped) schedule(backoffInterval(failures))
      }
    }

    setIsPolling(true)
    doPoll()

    return () => {
      stopped = true
      clearTimeout(timeoutId)
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
    lastPollAttempt,
    consecutiveFailures,
    loading,
  }
}
