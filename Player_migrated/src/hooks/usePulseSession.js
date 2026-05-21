import { useState, useEffect } from 'react'
import { ref, onValue, set } from 'firebase/database'
import { db } from '../lib/firebase'

/**
 * Subscribes to the active Pulse mini game session.
 *
 * Only activates when teamId and knownSessionId are both non-null.
 */
export function usePulseSession(teamId, knownSessionId = null) {
  const [sessionId, setSessionId] = useState(null)
  const [sessionData, setSessionData] = useState(null)

  // Step 1 — resolve the session ID
  useEffect(() => {
    if (!teamId) {
      setSessionId(null)
      setSessionData(null)
      return
    }
    setSessionId(knownSessionId ?? null)
  }, [teamId, knownSessionId])

  // Step 2 — watch the full session once we have a sessionId
  useEffect(() => {
    if (!sessionId) {
      setSessionData(null)
      return
    }

    const sessRef = ref(db, `pulseSessions/${sessionId}`)
    const unsub = onValue(
      sessRef,
      (snap) => setSessionData(snap.exists() ? snap.val() : null),
      (err) => {
        if (import.meta.env.DEV) console.warn('[Pulse] session error:', err.message)
      },
    )
    return unsub
  }, [sessionId])

  async function submitAnswer(answer) {
    if (!sessionId || !teamId) return
    const submissionRef = ref(db, `pulseSessions/${sessionId}/miniGame/submissions/${teamId}`)
    await set(submissionRef, Number(answer))
  }

  return { sessionData, sessionId, submitAnswer }
}
