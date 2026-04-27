import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import './games.css'

function parseDate(val) {
  if (!val) return null
  if (typeof val === 'string') return new Date(val)
  if (val < 9999999999) return new Date(val * 1000)
  return new Date(val)
}

function formatGameDate(val) {
  const d = parseDate(val)
  if (!d) return ''
  const date = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} · ${time.toLowerCase()}`
}

function StatusBadge({ status }) {
  if (status === 'registered')          return <span className="g-badge g-badge--registered">Registered</span>
  if (status === 'attendance_requested') return <span className="g-badge g-badge--attendance">Confirm Attendance</span>
  if (status === 'confirmed')           return <span className="g-badge g-badge--confirmed">Confirmed</span>
  return <span className="g-badge g-badge--open">Not Registered</span>
}

export default function Games() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getGames()
      .then(data => setGames(data.games ?? []))
      .catch(err => setError(err.message ?? 'Failed to load games.'))
      .finally(() => setLoading(false))
  }, [])

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
        </div>
      </div>
    )
  }

  return (
    <div className="games-page">

      <header className="games-header">
        <Link to="/dashboard" className="games-back">← Dashboard</Link>
        <p className="games-wordmark">QuizPulse</p>
        <h1 className="games-page-title">Upcoming Games</h1>
      </header>

      {games.length === 0 ? (
        <p className="games-empty">No upcoming games scheduled.</p>
      ) : (
        <div className="games-list">
          {games.map(game => (
            <Link
              key={game.canonical_session_id}
              to={`/games/${game.canonical_session_id}`}
              className="games-card"
            >
              <div className="games-card-top">
                <span className="games-card-title">{game.title}</span>
                <StatusBadge status={game.registration_status} />
              </div>
              <p className="games-card-venue">{game.venue}</p>
              <p className="games-card-date">{formatGameDate(game.starts_at)}</p>
              {game.team_name && (
                <div className="games-card-footer">
                  <span className="games-card-team">Team: {game.team_name}</span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

    </div>
  )
}
