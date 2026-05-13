import { useState, useEffect } from 'react'
import { ref, onValue, set } from 'firebase/database'
import { db } from '../lib/firebase'

/**
 * Subscribes to the active Pulse mini game session.
 *
 * Only activates when teamId is non-null (player has a team identity).
 * If knownSessionId is provided, subscribes directly to that session;
 * otherwise scans pulseSessions/ for the first session where state !== 'setup'.
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

    if (knownSessionId) {
      setSessionId(knownSessionId)
      return
    }

    const pulsesRef = ref(db, 'pulseSessions')
    const unsub = onValue(
      pulsesRef,
      (snap) => {
        const sessions = snap.val() ?? {}
        const activeId =
          Object.entries(sessions).find(
            ([, s]) => s?.state && s.state !== 'setup' && s.state !== 'complete'
          )?.[0] ?? null
        setSessionId(activeId)
      },
      (err) => {
        if (import.meta.env.DEV) console.warn('[Pulse] pulseSessions error:', err.message)
      },
    )
    return unsub
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
