import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, onSnapshot, getDoc, getDocs, setDoc, collection, query, serverTimestamp } from 'firebase/firestore'
import { firestore } from '../lib/firebase'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import './game-detail.css'

function formatGameDate(d) {
  if (!d) return ''
  const date = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} at ${time.toLowerCase()}`
}

function RegistrationStatusBadge({ registrationStatus }) {
  if (!registrationStatus) return null
  if (registrationStatus === 'checked_in')             return <span className="gd-badge gd-badge--checked-in">Checked In</span>
  if (registrationStatus === 'confirmed')              return <span className="gd-badge gd-badge--confirmed">Confirmed</span>
  if (registrationStatus === 'confirmation_requested') return <span className="gd-badge gd-badge--confirmation-requested">Confirmation Requested</span>
  if (registrationStatus === 'registered')             return <span className="gd-badge gd-badge--registered">Registered</span>
  if (registrationStatus === 'no_show')                return <span className="gd-badge gd-badge--no-show">Did Not Attend</span>
  return null
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
  const { user, player } = useAuth()

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  const [teamSize, setTeamSize] = useState(4)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [waitlistStatus, setWaitlistStatus] = useState(null)
  const [waitlistPosition, setWaitlistPosition] = useState(null)
  const [joiningWaitlist, setJoiningWaitlist] = useState(false)

  const userData = {
    teamId: detail?.team?.id ?? null,
    uid: user?.uid ?? null,
    displayName: player?.display_name ?? null,
    firstName: player?.first_name ?? null,
  }

  useEffect(() => {
    setLoading(true)
    setPageError('')
    let cancelled = false
    let unsubSession = null
    let unsubRegistration = null

    ;(async () => {
      try {
        let data
        try {
          data = await api.getGameDetails(canonicalSessionId)
        } catch (err) {
          if (err.code === 'SERVER_ERROR' || err.code === 'GAME_DETAILS_FAILED') {
            await new Promise(r => setTimeout(r, 1000))
            data = await api.getGameDetails(canonicalSessionId) // one retry
          } else {
            throw err
          }
        }
        if (cancelled) return
        setDetail(data)
        const initialSize = data.registration?.expected_team_size ?? data.registration?.confirmed_team_size
        if (initialSize) setTeamSize(initialSize)
        setLoading(false)

        // Real-time listener: session status (goes live, completes, etc.)
        unsubSession = onSnapshot(
          doc(firestore, 'sessions', canonicalSessionId),
          (snap) => {
            if (!snap.exists()) return
            const s = snap.data()
            setDetail(prev => ({
              ...prev,
              game: { ...prev.game, status: s.status, game_state: s.status === 'live' ? 'live' : null },
              can_register: !prev.registration && (s.status === 'open' || s.status === 'scheduled'),
            }))
          }
        )

        // Real-time listener: registration doc (confirmation_requested, checked_in, etc.)
        const teamId = data.team?.id ?? null
        if (teamId) {
          unsubRegistration = onSnapshot(
            doc(firestore, 'sessions', canonicalSessionId, 'registrations', teamId),
            (snap) => {
              if (!snap.exists()) {
                setDetail(prev => ({
                  ...prev,
                  registration: null,
                  can_confirm_attendance: false,
                  can_register: prev.game?.status === 'open' || prev.game?.status === 'scheduled',
                }))
                return
              }
              const reg = snap.data()
              const attendanceStatus = reg.attendanceStatus ?? 'not_requested'
              const registrationStatus =
                attendanceStatus === 'checked_in' ? 'checked_in' :
                attendanceStatus === 'no_show' ? 'no_show' :
                attendanceStatus === 'confirmed' ? 'confirmed' :
                (attendanceStatus === 'confirmation_requested' || attendanceStatus === 'attendance_requested') ? 'confirmation_requested' :
                'registered'
              setDetail(prev => ({
                ...prev,
                registration: {
                  id: teamId,
                  session_id: canonicalSessionId,
                  game_id: canonicalSessionId,
                  team_id: teamId,
                  team_name: data.team?.name ?? reg.teamName,
                  expected_team_size: reg.teamSize ?? null,
                  confirmed_team_size: reg.confirmedTeamSize ?? null,
                  attendance_status: attendanceStatus,
                  registration_status: registrationStatus,
                  status: 'registered',
                },
                can_confirm_attendance:
                  (attendanceStatus === 'confirmation_requested' || attendanceStatus === 'attendance_requested') &&
                  prev.game?.status !== 'completed',
                can_register: false,
              }))
            }
          )
        }
      } catch (err) {
        if (!cancelled) {
          setPageError(err.message ?? 'Failed to load game.')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      unsubSession?.()
      unsubRegistration?.()
    }
  }, [canonicalSessionId, retryCount])

  useEffect(() => {
    if (!detail?.game?.soldOut || !userData.teamId) return
    const checkWaitlist = async () => {
      try {
        const snap = await getDoc(doc(
          firestore,
          'sessions', canonicalSessionId,
          'waitlist', userData.teamId
        ))
        if (snap.exists()) {
          setWaitlistStatus(snap.data().status)
          setWaitlistPosition(snap.data().position)
        }
      } catch (e) {}
    }
    checkWaitlist()
  }, [canonicalSessionId, detail?.game?.soldOut, userData.teamId])

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

  async function handleCancelRegistration() {
    setActionBusy(true)
    setActionError('')
    try {
      await api.cancelRegistration(detail.game.game_id)
      const gameStatus = detail?.game?.status
      setDetail(prev => ({
        ...prev,
        registration: null,
        can_confirm_attendance: false,
        can_register: gameStatus === 'open' || gameStatus === 'scheduled',
      }))
    } catch (err) {
      setActionError(err.message ?? 'Failed to cancel registration. Please try again.')
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
          <button className="gd-btn gd-btn--primary" style={{ marginTop: '12px' }} onClick={() => setRetryCount(c => c + 1)}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const { game, team } = detail
  const canConfirmAttendance = detail?.can_confirm_attendance === true
  const isCaptain = detail?.is_captain === true
  const canRegister = detail?.can_register === true
  const registration = detail?.registration
  const attendanceStatus = registration?.attendance_status
  const registrationStatus = registration?.registration_status ?? null
  const hasTeam = !!team
  const isRegistered = !!registration
  const attendanceConfirmed = attendanceStatus === 'confirmed'
  const isCheckedIn = attendanceStatus === 'checked_in'
  const showConfirmAttendance = canConfirmAttendance

  const handleJoinWaitlist = async () => {
    if (!userData?.teamId || !isCaptain) return
    setJoiningWaitlist(true)
    try {
      const teamSnap = await getDoc(
        doc(firestore, 'teams', userData.teamId)
      )
      const team = teamSnap.data()

      const existingSnap = await getDocs(query(
        collection(firestore, 'sessions', canonicalSessionId, 'waitlist'),
      ))
      const position = existingSnap.docs
        .filter(d => d.data().status === 'waiting').length + 1

      await setDoc(
        doc(firestore, 'sessions', canonicalSessionId,
          'waitlist', userData.teamId),
        {
          teamId: userData.teamId,
          teamName: team.name,
          captainId: userData.uid,
          captainName: userData.displayName ?? userData.firstName ?? '',
          position,
          status: 'waiting',
          requestedAt: serverTimestamp(),
        }
      )
      setWaitlistStatus('waiting')
      setWaitlistPosition(position)
    } catch (e) {
      console.error(e)
    }
    setJoiningWaitlist(false)
  }

  return (
    <div className="gd-page">

      {/* ── Header ── */}
      <header className="gd-header">
        <Link to="/games" className="gd-back">← Games</Link>
        <p className="gd-wordmark">PulseIQ</p>
        <h1 className="gd-page-title">{game.name || 'Upcoming Game'}</h1>
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
            <span className="gd-meta-value">{formatGameDate(game.date?.toDate?.())}</span>
          </div>
          <div className="gd-meta-divider" />
          <div className="gd-meta-item">
            <span className="gd-meta-label">Entry Fee</span>
            <span className="gd-meta-value">$35 per person</span>
          </div>
        </div>
      </section>

      {/* ── Open Live Game — only for checked-in teams ── */}
      {isCheckedIn && (game.status === 'live' || game.game_state === 'live') && (
        <Link to={`/games/${canonicalSessionId}/live`} className="gd-open-live-btn">
          ⚡ Open Live Game →
        </Link>
      )}

      {/* ── Registration ── */}
      <section className="gd-section">
        <div className="gd-section-header">
          <p className="gd-section-title">Registration</p>
          {registrationStatus && <RegistrationStatusBadge registrationStatus={registrationStatus} />}
        </div>

        {game?.soldOut ? (
          <div style={{
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 12,
            padding: '1.25rem',
          }}>
            <p style={{
              color: '#ef4444', fontWeight: 800,
              fontSize: '0.9rem', marginBottom: '0.5rem',
            }}>
              🔴 This game is sold out
            </p>

            {waitlistStatus === 'waiting' ? (
              <>
                <p style={{
                  color: '#ccc', fontSize: '0.85rem',
                  marginBottom: '0.25rem',
                }}>
                  You're on the waitlist
                </p>
                <p style={{
                  color: '#f97316', fontWeight: 800,
                  fontSize: '1.5rem',
                }}>
                  #{waitlistPosition}
                </p>
                <p style={{
                  color: '#666', fontSize: '0.8rem',
                  marginTop: '0.5rem',
                }}>
                  We'll be in touch if a spot opens up.
                </p>
              </>
            ) : waitlistStatus === 'promoted' ? (
              <p style={{ color: '#4ade80', fontWeight: 700 }}>
                ✓ You've been moved to confirmed registrations
              </p>
            ) : isCaptain ? (
              <>
                <p style={{
                  color: '#888', fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}>
                  Join the waitlist and we'll contact you
                  if a spot becomes available.
                </p>
                <button
                  onClick={handleJoinWaitlist}
                  disabled={joiningWaitlist}
                  style={{
                    width: '100%',
                    background: 'rgba(249,115,22,0.15)',
                    color: '#f97316',
                    border: '1px solid rgba(249,115,22,0.3)',
                    borderRadius: 10,
                    padding: '0.75rem',
                    fontWeight: 800,
                    cursor: joiningWaitlist
                      ? 'not-allowed' : 'pointer',
                    opacity: joiningWaitlist ? 0.6 : 1,
                    fontSize: '0.9rem',
                  }}
                >
                  {joiningWaitlist
                    ? 'Joining...'
                    : 'Join Waitlist'
                  }
                </button>
              </>
            ) : (
              <p style={{
                color: '#888', fontSize: '0.85rem'
              }}>
                Only your team captain can join the waitlist.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* No team */}
            {!hasTeam && (
              <div className="gd-card gd-card--info">
                <p className="gd-readonly-note">You need a team to register for games.</p>
              </div>
            )}

            {/* Registration open — captain */}
            {hasTeam && canRegister && isCaptain && (
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
            {hasTeam && canRegister && !isCaptain && (
              <div className="gd-card gd-card--info">
                <p className="gd-readonly-note">Only your team captain can register for games.</p>
              </div>
            )}

            {/* Attendance confirmation — captain */}
            {hasTeam && showConfirmAttendance && isCaptain && (
              <div className="gd-card">
                {actionError && <div className="gd-error-banner">{actionError}</div>}
                {registration && (
                  <p className="gd-registered-team">
                    Registered as <strong>{registration.team_name}</strong>
                  </p>
                )}
                <p className="gd-action-prompt">Please confirm your team&apos;s attendance.</p>
                <SizePicker value={teamSize} onChange={setTeamSize} disabled={actionBusy} />
                <button
                  className="gd-btn gd-btn--primary"
                  onClick={handleConfirmAttendance}
                  disabled={actionBusy}
                >
                  {actionBusy ? 'Confirming…' : 'Confirm Attendance'}
                </button>
                <button
                  className="gd-btn gd-btn--ghost"
                  onClick={handleCancelRegistration}
                  disabled={actionBusy}
                >
                  {actionBusy ? 'Cancelling…' : 'Cancel Registration'}
                </button>
              </div>
            )}

            {/* Attendance confirmation — non-captain */}
            {hasTeam && showConfirmAttendance && !isCaptain && (
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
            {hasTeam && isRegistered && !canRegister && !showConfirmAttendance && (
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
                    ) : isCheckedIn ? (
                      <span className="gd-status-sub">Checked in</span>
                    ) : (
                      <span className="gd-status-sub">
                        Registered · attendance confirmation pending
                      </span>
                    )}
                  </div>
                  {(attendanceConfirmed || isCheckedIn) && (
                    <RegistrationStatusBadge registrationStatus={registrationStatus} />
                  )}
                </div>
                {!isCaptain && !attendanceConfirmed && !isCheckedIn && (
                  <p className="gd-readonly-note">Your captain will confirm attendance.</p>
                )}
              </div>
            )}

            {/* Has team, not registered, registration not open */}
            {hasTeam && !isRegistered && !canRegister && (
              <div className="gd-card gd-card--info">
                <p className="gd-readonly-note">
                  Registration is not currently open for this game.
                </p>
              </div>
            )}

            {/* Game is live — show waiting message for non-checked-in teams */}
            {game.status === 'live' && isRegistered && !isCheckedIn && (
              <div className="gd-card gd-card--live">
                <p className="gd-live-text">
                  Game is live — your host will check you in shortly.
                </p>
              </div>
            )}
          </>
        )}

      </section>

    </div>
  )
}
