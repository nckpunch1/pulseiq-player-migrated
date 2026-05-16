import { useState, useEffect, useMemo } from 'react'
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
  const [games, setGames] = useState([])
  const [myTeamId, setMyTeamId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('season') // season | alltime
  const [retryCount, setRetryCount] = useState(0)

  const playerRegion = useMemo(() => {
    if (!games?.length) return null
    const sorted = [...games]
      .filter(g => g.regionId)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    return sorted[0]
      ? { id: sorted[0].regionId, name: sorted[0].regionName }
      : null
  }, [games])

  useEffect(() => {
    setLoading(true)
    setError('')

    async function load() {
      const [lbData, gamesData, teamData] = await Promise.all([
        api.getLeaderboards(),
        api.getGames().catch(() => ({ games: [] })),
        api.getTeam().catch(() => null),
      ])

      const gs = gamesData?.games ?? []
      setGames(gs)
      setMyTeamId(teamData?.team?.id ?? null)

      const sorted = [...gs]
        .filter(g => g.regionId)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      const regionId = sorted[0]?.regionId ?? null

      let seasonEntries = []
      if (lbData.current_season) {
        seasonEntries = await api.getSeasonLeaderboard(lbData.current_season.id, regionId)
      }

      setData({
        current_season: lbData.current_season,
        current_season_leaderboard: seasonEntries,
        all_time_leaderboard: lbData.all_time_leaderboard ?? [],
      })
    }

    load()
      .catch(err => setError(err.message ?? 'Failed to load leaderboard.'))
      .finally(() => setLoading(false))
  }, [retryCount])

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
          <button style={{ marginTop: '12px', padding: '10px 24px', border: 'none', borderRadius: '8px', background: '#f97316', color: '#fff', fontWeight: 600, cursor: 'pointer' }} onClick={() => setRetryCount(c => c + 1)}>
            Try Again
          </button>
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
        <p className="lb-wordmark">PulseIQ</p>
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

      {tab === 'season' && (
        <p style={{
          fontSize: '0.75rem', color: '#888',
          textAlign: 'center', marginBottom: '0.5rem',
        }}>
          {playerRegion ? `🗺️ ${playerRegion.name} Rankings` : 'All Regions'}
        </p>
      )}

      <LeaderboardTable entries={entries} myTeamId={myTeamId} />

    </div>
  )
}
