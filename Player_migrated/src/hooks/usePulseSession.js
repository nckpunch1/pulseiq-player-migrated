import { useState, useEffect } from 'react'
import { ref, onValue, set } from 'firebase/database'
import { db } from '../lib/firebase'

/**
 * Subscribes to the active Pulse mini game session.
 *
 * Only activates when teamId is non-null (player has a team identity).
 * Listens to pulseSessions/ and finds the first session where state !== 'setup'.
 */
export function usePulseSession(teamId) {
  const [sessionId, setSessionId] = useState(null)
  const [sessionData, setSessionData] = useState(null)

  // Step 1 — watch pulseSessions/ for a session with state !== 'setup'
  useEffect(() => {
    if (!teamId) {
      setSessionId(null)
      setSessionData(null)
      return
    }

    const pulsesRef = ref(db, 'pulseSessions')
    const unsub = onValue(
      pulsesRef,
      (snap) => {
        const sessions = snap.val() ?? {}
        const activeId =
          Object.entries(sessions).find(([, s]) => s?.state && s.state !== 'setup')?.[0] ?? null
        setSessionId(activeId)
      },
      (err) => {
        if (import.meta.env.DEV) console.warn('[Pulse] pulseSessions error:', err.message)
      },
    )
    return unsub
  }, [teamId])

  // Step 2 — watch the full session once we have a sessionId
  useEffect(() => {
    if (!sessionId) {
      setSessionData(null)
      return
    }

    const sessRef = ref(db, `pulseSessions/${sessionId}`)
    const unsub = onValue(
      sessRef,
      (snap) => setSessionData(snap.val()),
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

  return { sessionData, submitAnswer }
}
