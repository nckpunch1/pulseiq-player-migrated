import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import './leaderboard.css'

function rankClass(rank) {
  if (rank === 1) return 'lb-rank--gold'
  if (rank === 2) return 'lb-rank--silver'
  if (rank === 3) return 'lb-rank--bronze'
  return 'lb-rank--other'
}

function LeaderboardTable({ entries, myTeamId }) {
  if (!entries.length) {
    return <p className="lb-empty">No results yet.</p>
  }

  return (
    <div className="lb-card">
      <div className="lb-col-header">
        <span className="lb-col-label" style={{ textAlign: 'center' }}>#</span>
        <span className="lb-col-label">Team</span>
        <span className="lb-col-label lb-col-label--right">Pts</span>
      </div>
      {entries.map((entry, i) => {
        const isOwn = myTeamId && entry.team_id === myTeamId
        return (
          <div
            key={entry.team_id}
            className={[
              'lb-row',
              i < entries.length - 1 ? 'lb-row--bordered' : '',
              isOwn ? 'lb-row--own' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className={`lb-rank ${rankClass(entry.rank)}`}>{entry.rank}</span>

            <div className="lb-team-cell">
              <span className={`lb-team-name${isOwn ? ' lb-team-name--own' : ''}`}>
                {entry.team_name}
              </span>
              {isOwn && <span className="lb-own-badge">You</span>}
            </div>

            <div className="lb-stats">
              <span className="lb-points">{entry.total_points}</span>
              <span className="lb-games">{entry.games_played} {entry.games_played === 1 ? 'game' : 'games'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Leaderboard() {
  const [data, setData] = useState(null)
  const [myTeamId, setMyTeamId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('season') // season | alltime

  useEffect(() => {
    Promise.all([
      api.getLeaderboards(),
      api.getTeam().catch(() => null),
    ])
      .then(([lbData, teamData]) => {
        setData(lbData)
        setMyTeamId(teamData?.team?.id ?? null)
      })
      .catch(err => setError(err.message ?? 'Failed to load leaderboard.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="lb-page">
        <div className="lb-state-fill">
          <p className="lb-loading-text">Loading…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="lb-page">
        <div className="lb-state-fill">
          <div className="lb-error-box">{error}</div>
        </div>
      </div>
    )
  }

  const { current_season, current_season_leaderboard, all_time_leaderboard } = data
  const entries = tab === 'season' ? (current_season_leaderboard ?? []) : (all_time_leaderboard ?? [])

  return (
    <div className="lb-page">

      <header className="lb-header">
        <Link to="/dashboard" className="lb-back">← Dashboard</Link>
        <p className="lb-wordmark">QuizPulse</p>
        <h1 className="lb-page-title">Leaderboard</h1>
        {tab === 'season' && current_season?.name && (
          <p className="lb-season-name">{current_season.name}</p>
        )}
      </header>

      <div className="lb-tab-row">
        <button
          className={`lb-tab${tab === 'season' ? ' lb-tab--active' : ''}`}
          onClick={() => setTab('season')}
        >
          This Season
        </button>
        <button
          className={`lb-tab${tab === 'alltime' ? ' lb-tab--active' : ''}`}
          onClick={() => setTab('alltime')}
        >
          All Time
        </button>
      </div>

      <LeaderboardTable entries={entries} myTeamId={myTeamId} />

    </div>
  )
}
