import { useState, useEffect } from 'react'
import { ref, onValue, set } from 'firebase/database'
import { db } from '../lib/firebase'

/**
 * Subscribes to the active Pulse mini game session.
 *
 * Only activates when teamId is non-null (player has a team identity).
 * Listens to activePulseSession → sessionId → pulseSession/{sessionId}.
 *
 * Returns current session data and a function to write the team's submission.
 */
export function usePulseSession(teamId) {
  const [sessionId, setSessionId] = useState(null)
  const [sessionData, setSessionData] = useState(null)

  // Step 1 — watch activePulseSession for the current sessionId
  useEffect(() => {
    if (!teamId) {
      setSessionId(null)
      setSessionData(null)
      return
    }

    const activeRef = ref(db, 'activePulseSession')
    const unsub = onValue(
      activeRef,
      (snap) => setSessionId(snap.val()?.sessionId ?? null),
      (err) => {
        if (import.meta.env.DEV) console.warn('[Pulse] activePulseSession error:', err.message)
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

    const sessRef = ref(db, `pulseSession/${sessionId}`)
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
    const submissionRef = ref(db, `pulseSession/${sessionId}/miniGame/submissions/${teamId}`)
    await set(submissionRef, Number(answer))
  }

  return { sessionData, submitAnswer }
}
