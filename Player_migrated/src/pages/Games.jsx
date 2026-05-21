import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { firestore } from '../lib/firebase'
import { api } from '../api/client'
import './games.css'

function formatGameDate(d) {
  if (!d) return ''
  const date = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} · ${time.toLowerCase()}`
}

function GameBadge({ gameStatus, registrationStatus }) {
  if (gameStatus === 'live')      return <span className="g-badge g-badge--live">Live</span>
  if (gameStatus === 'completed') return <span className="g-badge g-badge--completed">Completed</span>
  if (registrationStatus === 'checked_in')             return <span className="g-badge g-badge--checked-in">Checked In</span>
  if (registrationStatus === 'confirmed')              return <span className="g-badge g-badge--confirmed">Confirmed</span>
  if (registrationStatus === 'confirmation_requested') return <span className="g-badge g-badge--confirmation-requested">Confirmation Requested</span>
  if (registrationStatus === 'registered')             return <span className="g-badge g-badge--registered">Registered</span>
  if (registrationStatus === 'no_show')                return <span className="g-badge g-badge--no-show">Did Not Attend</span>
  return <span className="g-badge g-badge--open">Not Registered</span>
}

export default function Games() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError('')
    const sessUnsubs = new Map()
    const regUnsubs = new Map()

    function mapStatus(attendanceStatus) {
      if (attendanceStatus === 'checked_in') return 'checked_in'
      if (attendanceStatus === 'no_show') return 'no_show'
      if (attendanceStatus === 'confirmed') return 'confirmed'
      if (attendanceStatus === 'confirmation_requested' || attendanceStatus === 'attendance_requested') return 'confirmation_requested'
      return 'registered'
    }

    api.getGames()
      .then(data => {
        const initialGames = data.games ?? []
        setGames(initialGames)
        setLoading(false)

        const teamId = initialGames.find(g => g.team_id)?.team_id ?? null

        for (const game of initialGames) {
          const sessionId = game.canonical_session_id

          // Session status listener (e.g. game goes live or completes)
          sessUnsubs.set(sessionId, onSnapshot(
            doc(firestore, 'sessions', sessionId),
            (snap) => {
              if (!snap.exists()) return
              const status = snap.data().status
              setGames(prev => prev.map(g =>
                g.canonical_session_id === sessionId ? { ...g, status } : g
              ))
            }
          ))

          // Registration status listener (confirmation_requested, checked_in, etc.)
          if (teamId) {
            regUnsubs.set(sessionId, onSnapshot(
              doc(firestore, 'sessions', sessionId, 'registrations', teamId),
              (snap) => {
                setGames(prev => prev.map(g => {
                  if (g.canonical_session_id !== sessionId) return g
                  if (!snap.exists()) return { ...g, registration_status: 'not_registered', team_name: null }
                  const reg = snap.data()
                  return { ...g, registration_status: mapStatus(reg.attendanceStatus), team_name: reg.teamName ?? g.team_name }
                }))
              }
            ))
          }
        }
      })
      .catch(err => {
        setError(err.message ?? 'Failed to load games.')
        setLoading(false)
      })

    return () => {
      for (const unsub of sessUnsubs.values()) unsub()
      for (const unsub of regUnsubs.values()) unsub()
    }
  }, [retryCount])

  if (loading) {
    return (
      <div className="games-page">
        <div className="games-state-fill">
          <p className="games-loading-text">Loading…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="games-page">
        <div className="games-state-fill">
          <div className="games-error-box">{error}</div>
          <button style={{ marginTop: '12px', padding: '10px 24px', border: 'none', borderRadius: '8px', background: '#f97316', color: '#fff', fontWeight: 600, cursor: 'pointer' }} onClick={() => setRetryCount(c => c + 1)}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const upcomingGames = games.filter(g => g.status === 'open' || g.status === 'scheduled' || g.status === 'live')
  const pastGames = games.filter(g => g.status === 'complete' || g.status === 'completed')

  return (
    <div className="games-page">

      <header className="games-header">
        <Link to="/dashboard" className="games-back">← Dashboard</Link>
        <p className="games-wordmark">PulseIQ</p>
        <h1 className="games-page-title">Upcoming Games</h1>
      </header>

      {upcomingGames.length === 0 ? (
        <p className="games-empty">No upcoming games scheduled.</p>
      ) : (
        <div className="games-list">
          {upcomingGames.map(game => {
            const isLiveCheckedIn = game.status === 'live' && game.registration_status === 'checked_in'
            return (
              <div key={game.canonical_session_id} className="games-card-wrap">
                <Link
                  to={`/games/${game.canonical_session_id}`}
                  className="games-card"
                >
                  <div className="games-card-top">
                    <span className="games-card-title">{game.name || 'Upcoming Game'}</span>
                    <GameBadge gameStatus={game.status} registrationStatus={game.registration_status} />
                  </div>
                  <p className="games-card-venue">{game.venue}</p>
                  <p className="games-card-date">{formatGameDate(game.date?.toDate?.())}</p>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: 'rgba(249,115,22,0.12)',
                    border: '1px solid rgba(249,115,22,0.3)',
                    color: '#f97316',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    padding: '2px 10px',
                    borderRadius: 99,
                    letterSpacing: '0.02em',
                  }}>
                    $35 per team
                  </span>
                  {game.team_name && (
                    <div className="games-card-footer">
                      <span className="games-card-team">Team: {game.team_name}</span>
                    </div>
                  )}
                </Link>
                {isLiveCheckedIn && (
                  <Link
                    to={`/games/${game.canonical_session_id}/live`}
                    className="games-enter-live-btn"
                  >
                    ⚡ Enter Live Game
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}

      {pastGames.length > 0 && (
        <>
          <p className="games-section-title">Past Games</p>
          <div className="games-list">
            {pastGames.map(game => (
              <Link
                key={game.canonical_session_id}
                to={`/games/${game.canonical_session_id}`}
                className="games-card games-card--past"
              >
                <div className="games-card-top">
                  <span className="games-card-title">{game.name || 'Upcoming Game'}</span>
                  <GameBadge gameStatus={game.status} registrationStatus={game.registration_status} />
                </div>
                <p className="games-card-venue">{game.venue}</p>
                <p className="games-card-date">{formatGameDate(game.date?.toDate?.())}</p>
                <div className="games-card-footer">
                  {game.team_name && <span className="games-card-team">Team: {game.team_name}</span>}
                  <span className="games-card-results-link">View Results →</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

    </div>
  )
}
