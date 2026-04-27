import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import './game-detail.css'

function parseDate(val) {
  if (!val) return null
  if (typeof val === 'string') return new Date(val)
  if (val < 9999999999) return new Date(val * 1000)
  return new Date(val)
}

function formatGameDate(val) {
  const d = parseDate(val)
  if (!d) return ''
  const date = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} at ${time.toLowerCase()}`
}

function SizePicker({ value, onChange, disabled }) {
  return (
    <div className="gd-slider-wrap">
      <span className="gd-slider-value">{value}</span>
      <p className="gd-slider-unit">{value === 1 ? 'player' : 'players'}</p>
      <input
        type="range"
        className="gd-slider"
        min={1}
        max={8}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        disabled={disabled}
      />
      <div className="gd-slider-ticks">
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i + 1}
            className={`gd-slider-tick${value === i + 1 ? ' gd-slider-tick--active' : ''}`}
          >
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function GameDetail() {
  const { id: canonicalSessionId } = useParams()
  const { isCaptain } = useAuth()

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  const [teamSize, setTeamSize] = useState(4)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    api.getGameDetails(canonicalSessionId)
      .then(data => {
        setDetail(data)
        if (data.registration?.confirmed_team_size) {
          setTeamSize(data.registration.confirmed_team_size)
        }
      })
      .catch(err => setPageError(err.message ?? 'Failed to load game.'))
      .finally(() => setLoading(false))
  }, [canonicalSessionId])

  async function handleRegister() {
    setActionBusy(true)
    setActionError('')
    try {
      const data = await api.registerForGame(detail.game.game_id, teamSize)
      setDetail(prev => ({
        ...prev,
        registration: data.registration,
        can_register: false,
        can_confirm_attendance: false,
      }))
    } catch (err) {
      setActionError(err.message ?? 'Registration failed. Please try again.')
    } finally {
      setActionBusy(false)
    }
  }

  async function handleConfirmAttendance() {
    setActionBusy(true)
    setActionError('')
    try {
      const data = await api.confirmAttendance(detail.game.game_id, teamSize)
      setDetail(prev => ({
        ...prev,
        registration: { ...prev.registration, ...data.registration },
        can_confirm_attendance: false,
      }))
    } catch (err) {
      setActionError(err.message ?? 'Failed to confirm attendance. Please try again.')
    } finally {
      setActionBusy(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="gd-page">
        <div className="gd-state-fill">
          <p className="gd-loading-text">Loading…</p>
        </div>
      </div>
    )
  }

  if (pageError) {
    return (
      <div className="gd-page">
        <div className="gd-state-fill">
          <div className="gd-error-box">{pageError}</div>
        </div>
      </div>
    )
  }

  const { game, team, registration, can_register, can_confirm_attendance } = detail
  const hasTeam = !!team
  const isRegistered = !!registration
  const attendanceConfirmed = registration?.attendance_status === 'confirmed'

  return (
    <div className="gd-page">

      {/* ── Header ── */}
      <header className="gd-header">
        <Link to="/games" className="gd-back">← Games</Link>
        <p className="gd-wordmark">QuizPulse</p>
        <h1 className="gd-page-title">{game.title}</h1>
      </header>

      {/* ── Venue & date ── */}
      <section className="gd-section">
        <div className="gd-meta-card">
          <div className="gd-meta-item">
            <span className="gd-meta-label">Venue</span>
            <span className="gd-meta-value">{game.venue}</span>
          </div>
          <div className="gd-meta-divider" />
          <div className="gd-meta-item">
            <span className="gd-meta-label">Date &amp; Time</span>
            <span className="gd-meta-value">{formatGameDate(game.starts_at)}</span>
          </div>
        </div>
      </section>

      {/* ── Registration ── */}
      <section className="gd-section">
        <p className="gd-section-title">Registration</p>

        {/* No team */}
        {!hasTeam && (
          <div className="gd-card gd-card--info">
            <p className="gd-readonly-note">You need a team to register for games.</p>
          </div>
        )}

        {/* Registration open — captain */}
        {hasTeam && can_register && isCaptain && (
          <div className="gd-card">
            {actionError && <div className="gd-error-banner">{actionError}</div>}
            <p className="gd-action-prompt">How many players will attend?</p>
            <SizePicker value={teamSize} onChange={setTeamSize} disabled={actionBusy} />
            <button
              className="gd-btn gd-btn--primary"
              onClick={handleRegister}
              disabled={actionBusy}
            >
              {actionBusy ? 'Registering…' : 'Register Team'}
            </button>
          </div>
        )}

        {/* Registration open — non-captain */}
        {hasTeam && can_register && !isCaptain && (
          <div className="gd-card gd-card--info">
            <p className="gd-readonly-note">Only your team captain can register for games.</p>
          </div>
        )}

        {/* Attendance confirmation — captain */}
        {hasTeam && can_confirm_attendance && isCaptain && (
          <div className="gd-card">
            {actionError && <div className="gd-error-banner">{actionError}</div>}
            {registration && (
              <p className="gd-registered-team">
                Registered as <strong>{registration.team_name}</strong>
              </p>
            )}
            <p className="gd-action-prompt">Confirm how many players will attend.</p>
            <SizePicker value={teamSize} onChange={setTeamSize} disabled={actionBusy} />
            <button
              className="gd-btn gd-btn--primary"
              onClick={handleConfirmAttendance}
              disabled={actionBusy}
            >
              {actionBusy ? 'Confirming…' : 'Confirm Attendance'}
            </button>
          </div>
        )}

        {/* Attendance confirmation — non-captain */}
        {hasTeam && can_confirm_attendance && !isCaptain && (
          <div className="gd-card gd-card--info">
            {registration && (
              <p className="gd-registered-team">
                Registered as <strong>{registration.team_name}</strong>
              </p>
            )}
            <p className="gd-readonly-note">Attendance confirmation pending — your captain will confirm.</p>
          </div>
        )}

        {/* Registered, no current action */}
        {hasTeam && isRegistered && !can_register && !can_confirm_attendance && (
          <div className="gd-card">
            <div className="gd-status-row">
              <span className="gd-status-check">✓</span>
              <div className="gd-status-info">
                <span className="gd-status-team">{registration.team_name}</span>
                {attendanceConfirmed ? (
                  <span className="gd-status-sub">
                    Attendance confirmed · {registration.confirmed_team_size}{' '}
                    {registration.confirmed_team_size === 1 ? 'player' : 'players'}
                  </span>
                ) : (
                  <span className="gd-status-sub">
                    Registered · attendance confirmation pending
                  </span>
                )}
              </div>
              {attendanceConfirmed && (
                <span className="gd-badge gd-badge--confirmed">Confirmed</span>
              )}
            </div>
            {!isCaptain && !attendanceConfirmed && (
              <p className="gd-readonly-note">Your captain will confirm attendance.</p>
            )}
          </div>
        )}

        {/* Has team, not registered, registration not open */}
        {hasTeam && !isRegistered && !can_register && (
          <div className="gd-card gd-card--info">
            <p className="gd-readonly-note">
              Registration is not currently open for this game.
            </p>
          </div>
        )}

        {/* Game is live */}
        {game.status === 'live' && isRegistered && (
          <div className="gd-card gd-card--live">
            <p className="gd-live-text">
              Game is live — your host will open the game shortly.
            </p>
          </div>
        )}

      </section>

    </div>
  )
}
