import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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

  const upcomingGames = games.filter(g => g.status === 'open' || g.status === 'scheduled' || g.status === 'live')
  const pastGames = games.filter(g => g.status === 'complete' || g.status === 'completed')

  return (
    <div className="games-page">

      <header className="games-header">
        <Link to="/dashboard" className="games-back">← Dashboard</Link>
        <p className="games-wordmark">QuizPulse</p>
        <h1 className="games-page-title">Upcoming Games</h1>
      </header>

      {upcomingGames.length === 0 ? (
        <p className="games-empty">No upcoming games scheduled.</p>
      ) : (
        <div className="games-list">
          {upcomingGames.map(game => (
            <Link
              key={game.canonical_session_id}
              to={`/games/${game.canonical_session_id}`}
              className="games-card"
            >
              <div className="games-card-top">
                <span className="games-card-title">{game.name || 'Upcoming Game'}</span>
                <GameBadge gameStatus={game.status} registrationStatus={game.registration_status} />
              </div>
              <p className="games-card-venue">{game.venue}</p>
              <p className="games-card-date">{formatGameDate(game.date?.toDate?.())}</p>
              {game.team_name && (
                <div className="games-card-footer">
                  <span className="games-card-team">Team: {game.team_name}</span>
                </div>
              )}
            </Link>
          ))}
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
