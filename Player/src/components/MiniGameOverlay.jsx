import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import { usePulseSession } from '../hooks/usePulseSession'
import './mini-game-overlay.css'

const MODE_LABELS = {
  blitz:        'Blitz Round',
  beer:         'Beer & Knowledge',
  'single-team': 'Team Challenge',
  draw:         'Special Round',
  closest:      'Closest Answer',
}

export default function MiniGameOverlay() {
  const { isCaptain, isLoggedIn } = useAuth()

  // Fetch team identity — overlay only activates when player has a team
  const [teamId, setTeamId]     = useState(null)
  const [teamName, setTeamName] = useState('')

  useEffect(() => {
    if (!isLoggedIn) return
    api.getTeam()
      .then((data) => {
        if (data?.team) {
          setTeamId(data.team.id)
          setTeamName(data.team.name)
        }
      })
      .catch(() => {})
  }, [isLoggedIn])

  const { sessionData, submitAnswer } = usePulseSession(teamId)

  // Closest Answer submission state
  const [answer, setAnswer]         = useState('')
  const [submitted, setSubmitted]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const state    = sessionData?.state
  const mode     = sessionData?.mode
  const miniGame = sessionData?.miniGame

  // True when this team already has a value in Firebase submissions
  const alreadySubmitted = teamId != null && miniGame?.submissions?.[teamId] != null

  // Clear local state when session resets to setup / disappears
  useEffect(() => {
    if (!state || state === 'setup') {
      setAnswer('')
      setSubmitted(false)
      setSubmitting(false)
      setSubmitError('')
    }
  }, [state])

  // Sync locked state from Firebase (e.g. page reload after submission)
  useEffect(() => {
    if (alreadySubmitted) setSubmitted(true)
  }, [alreadySubmitted])

  // Nothing to show — no team, no session, or session in setup
  if (!teamId || !state || state === 'setup') return null

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = answer.trim()
    if (!trimmed || submitting || submitted) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await submitAnswer(trimmed)
      setSubmitted(true)
    } catch {
      setSubmitError('Could not lock in your answer. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Result screen ────────────────────────────────────────────────────────────

  if (state === 'revealing' || state === 'revealed') {
    return (
      <div className="mgov" role="dialog" aria-modal="true" aria-label="Mini game results">
        <div className="mgov-content">
          <p className="mgov-team-label">{teamName}</p>
          <div className="mgov-pulse-wrap">
            <div className="mgov-ring mgov-ring--gold" />
            <div className="mgov-ring mgov-ring--gold mgov-ring--delay" />
            <div className="mgov-dot mgov-dot--gold" />
          </div>
          <h1 className="mgov-heading">Check the big screen</h1>
          <p className="mgov-sub">Results are being revealed!</p>
        </div>
      </div>
    )
  }

  // ── Closest Answer UI ────────────────────────────────────────────────────────

  if (state === 'active' && mode === 'closest') {
    const isLocked = submitted || alreadySubmitted
    return (
      <div className="mgov" role="dialog" aria-modal="true" aria-label="Closest Answer submission">
        <div className="mgov-content">
          <p className="mgov-team-label">{teamName}</p>
          <p className="mgov-mode-label">Closest Answer</p>

          {miniGame?.questionText && (
            <p className="mgov-question">{miniGame.questionText}</p>
          )}

          {isCaptain ? (
            isLocked ? (
              <div className="mgov-locked">
                <span className="mgov-locked-check">✓</span>
                <p className="mgov-locked-text">Answer locked in</p>
              </div>
            ) : (
              <form className="mgov-form" onSubmit={handleSubmit}>
                {submitError && <p className="mgov-error">{submitError}</p>}
                <input
                  className="mgov-number-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Your answer"
                  value={answer}
                  onChange={e => setAnswer(e.target.value.replace(/[^0-9]/g, ''))}
                  disabled={submitting}
                  autoFocus
                  autoComplete="off"
                  aria-label="Your numerical answer"
                />
                <button
                  className="mgov-btn"
                  type="submit"
                  disabled={!answer.trim() || submitting}
                >
                  {submitting ? 'Locking in…' : 'Lock In Answer'}
                </button>
              </form>
            )
          ) : (
            <p className="mgov-captain-note">
              Your captain is submitting the answer.
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Passive holding screen (blitz, beer, single-team, draw) ─────────────────

  if (state === 'active') {
    return (
      <div className="mgov" role="dialog" aria-modal="true" aria-label="Mini game in progress">
        <div className="mgov-content">
          <p className="mgov-team-label">{teamName}</p>
          <p className="mgov-mode-label">{MODE_LABELS[mode] ?? 'Mini Game'}</p>
          <div className="mgov-pulse-wrap">
            <div className="mgov-ring" />
            <div className="mgov-ring mgov-ring--delay" />
            <div className="mgov-dot" />
          </div>
          <h1 className="mgov-heading">Watch the big screen</h1>
          <p className="mgov-sub">Your host is running the game.</p>
        </div>
      </div>
    )
  }

  return null
}
