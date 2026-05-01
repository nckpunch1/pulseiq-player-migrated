import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import './dashboard.css'

function formatGameDate(isoString) {
  const d = new Date(isoString)
  const date = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} · ${time.toLowerCase()}`
}

function RegistrationBadge({ status, gameStatus }) {
  if (gameStatus === 'live')      return <span className="dash-badge dash-badge--live">Live</span>
  if (gameStatus === 'completed') return <span className="dash-badge dash-badge--completed">Completed</span>
  if (status === 'registered')           return <span className="dash-badge dash-badge--registered">Registered</span>
  if (status === 'attendance_requested') return <span className="dash-badge dash-badge--attendance">Confirm Attendance</span>
  if (status === 'confirmed')            return <span className="dash-badge dash-badge--confirmed">Confirmed</span>
  return <span className="dash-badge dash-badge--not-registered">Not Registered</span>
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        let data
        try {
          data = await api.dashboard()
        } catch (err) {
          if (err.code === 'SERVER_ERROR') {
            await new Promise(r => setTimeout(r, 800))
            data = await api.dashboard() // one retry
          } else {
            throw err
          }
        }
        setData(data)
      } catch (err) {
        setError(err.message ?? 'Failed to load dashboard.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) {
    return (
      <div className="dash-page">
        <div className="dash-state-fill">
          <p className="dash-loading-text">Loading…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dash-page">
        <div className="dash-state-fill">
          <div className="dash-error-box">{error}</div>
        </div>
      </div>
    )
  }

  const { player, team, membership, upcoming_games, registered_games, pending_join_requests, leaderboard_summary } = data
  const isCaptain = membership?.is_captain ?? false
  const pendingCount = isCaptain ? (pending_join_requests?.length ?? 0) : 0
  const seasonRank = leaderboard_summary?.team_current_season_rank
  const allTimeRank = leaderboard_summary?.team_all_time_rank
  const hasRanks = seasonRank != null || allTimeRank != null

  const allGames = [...(upcoming_games ?? []), ...(registered_games ?? [])]
  const liveGame = allGames.find(g => g.status === 'live')

  const rawUpcoming = upcoming_games ?? []
  const pastGamesFromApi = data.past_games ?? null
  let upcomingToShow, pastToShow
  if (pastGamesFromApi !== null) {
    upcomingToShow = rawUpcoming
    pastToShow = pastGamesFromApi.slice(0, 2)
  } else {
    upcomingToShow = rawUpcoming.filter(g => !(g.registration_status === 'confirmed' && g.status === 'completed'))
    pastToShow = rawUpcoming
      .filter(g => g.registration_status === 'confirmed' && g.status === 'completed')
      .slice(0, 2)
  }

  return (
    <div className="dash-page">

      {/* ── Live game banner ── */}
      {liveGame && (
        <div className="dash-live-banner">
          <p className="dash-live-banner-eyebrow">⚡ Your game is live</p>
          <p className="dash-live-banner-title">{liveGame.title} at {liveGame.venue}</p>
          <Link to={`/games/${liveGame.id}/live`} className="dash-live-banner-btn">
            Join Now →
          </Link>
        </div>
      )}

      {/* ── Header ── */}
      <header className="dash-header">
        <p className="dash-wordmark">QuizPulse</p>
        <h1 className="dash-player-name">{player.display_name}</h1>
        <p className="dash-username">@{player.username}</p>
      </header>

      {/* ── Hero CTA ── */}
      <section className="dash-section">
        <Link to="/games" className="dash-hero-card">
          <p className="dash-hero-label">Ready to play?</p>
          <p className="dash-hero-title">Browse Games</p>
          <p className="dash-hero-sub">Register your team for upcoming quizzes →</p>
        </Link>
      </section>

      {/* ── Team ── */}
      <section className="dash-section">
        {team ? (
          <div className="dash-card">
            <div className="dash-team-row">
              <div className="dash-team-name-group">
                <span className="dash-team-name">{team.name}</span>
                {isCaptain && (
                  <span className="dash-badge dash-badge--captain">Captain</span>
                )}
              </div>
              {isCaptain && pendingCount > 0 && (
                <Link to="/team" className="dash-requests-link">
                  <span className="dash-requests-label">Join Requests</span>
                  <span className="dash-notif-badge">{pendingCount}</span>
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="dash-card dash-card--no-team">
            <p className="dash-no-team-title">You&apos;re not on a team yet</p>
            <p className="dash-no-team-sub">Create your own or find one to join.</p>
            <div className="dash-no-team-actions">
              <Link to="/team" className="dash-btn dash-btn--primary">Create a Team</Link>
              <Link to="/team?tab=search" className="dash-btn dash-btn--ghost">Join a Team</Link>
            </div>
          </div>
        )}
      </section>

      {/* ── Leaderboard summary ── */}
      {hasRanks && (
        <section className="dash-section">
          <p className="dash-section-title">Your Team&apos;s Ranking</p>
          <div className="dash-rank-strip">
            {seasonRank != null && (
              <div className="dash-rank-item">
                <span className="dash-rank-label">Season Rank</span>
                <span className="dash-rank-value">#{seasonRank}</span>
              </div>
            )}
            {allTimeRank != null && (
              <div className="dash-rank-item">
                <span className="dash-rank-label">All-Time</span>
                <span className="dash-rank-value">#{allTimeRank}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Upcoming games ── */}
      <section className="dash-section">
        <p className="dash-section-title">Upcoming Games</p>
        {upcomingToShow.length ? (
          <div className="dash-games-list">
            {upcomingToShow.map(game => (
              <Link key={game.id} to={`/games/${game.id}`} className="dash-game-card">
                <div className="dash-game-top">
                  <span className="dash-game-title">{game.title}</span>
                  <RegistrationBadge status={game.registration_status} gameStatus={game.status} />
                </div>
                <p className="dash-game-venue">{game.venue}</p>
                <p className="dash-game-date">{formatGameDate(game.starts_at)}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="dash-empty">No upcoming games scheduled.</p>
        )}
      </section>

      {/* ── Recent Results ── */}
      {pastToShow.length > 0 && (
        <section className="dash-section">
          <p className="dash-section-title">Recent Results</p>
          <div className="dash-games-list">
            {pastToShow.map(game => (
              <Link key={game.id} to={`/games/${game.id}`} className="dash-game-card dash-game-card--past">
                <div className="dash-game-top">
                  <span className="dash-game-title">{game.title}</span>
                  <RegistrationBadge status={game.registration_status} gameStatus={game.status} />
                </div>
                <p className="dash-game-venue">{game.venue}</p>
                <p className="dash-game-date">{formatGameDate(game.starts_at)}</p>
                <span className="dash-view-results">View Results →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
