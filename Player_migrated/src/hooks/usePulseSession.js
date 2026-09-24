import { useState, useEffect, useMemo } from 'react'
import { ref, onValue, set } from 'firebase/database'
import { db } from '../lib/firebase'

/**
 * Subscribes to the active Pulse mini game session.
 *
 * Only activates when teamId and knownSessionId are both non-null.
 */
export function usePulseSession(teamId, knownSessionId = null) {
  const sessionId = teamId ? knownSessionId : null
  // Each subscription has its own identity, including when returning to an ID
  // visited earlier. Never render a snapshot from a previous subscription.
  const subscription = useMemo(() => ({ sessionId }), [sessionId])
  const [snapshot, setSnapshot] = useState(null)
  const sessionData = snapshot?.subscription === subscription ? snapshot.data : null

  useEffect(() => {
    if (!sessionId) return
    let active = true
    const sessRef = ref(db, `pulseSessions/${sessionId}`)
    const unsub = onValue(
      sessRef,
      (snap) => {
        if (active) setSnapshot({ subscription, data: snap.exists() ? snap.val() : null })
      },
      (err) => {
        if (active && import.meta.env.DEV) console.warn('[Pulse] session error:', err.message)
      },
    )
    return () => {
      active = false
      unsub()
    }
  }, [sessionId, subscription])

  async function submitAnswer(answer) {
    if (!sessionId || !teamId) return
    const submissionRef = ref(db, `pulseSessions/${sessionId}/miniGame/submissions/${teamId}`)
    await set(submissionRef, Number(answer))
  }

  return { sessionData, sessionId, submitAnswer }
}
