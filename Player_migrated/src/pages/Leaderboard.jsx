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
  const [teamId, setTeamId] = useState(undefined) // undefined = loading
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('season') // season | alltime
  const [retryCount, setRetryCount] = useState(0)
  const [regions, setRegions] = useState([])
  const [selectedRegionId, setSelectedRegionId] = useState(null)

  useEffect(() => {
    api.getTeamId()
      .then(id => setTeamId(id ?? null))
      .catch(() => setTeamId(null))
  }, [])

  useEffect(() => {
    if (!teamId) return
    api.listRegions?.()
      .then(setRegions)
      .catch(() => {})
  }, [teamId])

  useEffect(() => {
    setData(null)
    setLoading(true)
    setError('')

    async function load() {
      const lbData = await api.getLeaderboards(selectedRegionId)

      let seasonEntries = []
      if (lbData.current_season) {
        seasonEntries = await api.getSeasonLeaderboard(lbData.current_season.id, selectedRegionId)
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
  }, [retryCount, selectedRegionId])

  if (loading || teamId === undefined) {
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

  if (teamId === null) return (
    <div style={{
      textAlign: 'center', padding: '3rem 1.5rem',
      color: '#888'
    }}>
      <p style={{ fontSize: '2rem', marginBottom: '1rem' }}>🏆</p>
      <p style={{ fontWeight: 700, color: '#fff',
        marginBottom: '0.5rem' }}>
        Join a team to see the leaderboard
      </p>
      <p style={{ fontSize: '0.85rem' }}>
        Once you're part of a team you'll be able to track
        your standings here.
      </p>
      <a href="/team" style={{
        display: 'inline-block', marginTop: '1.5rem',
        background: '#f97316', color: '#000',
        padding: '0.625rem 1.5rem', borderRadius: 8,
        fontWeight: 700, textDecoration: 'none',
        fontSize: '0.875rem',
      }}>
        Find a Team
      </a>
    </div>
  )

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

      {regions.length > 1 && (
        <div style={{
          display: 'flex', gap: '0.5rem',
          overflowX: 'auto', paddingBottom: '0.5rem',
          marginBottom: '1rem',
        }}>
          <button
            onClick={() => setSelectedRegionId(null)}
            style={{
              padding: '0.375rem 0.875rem', borderRadius: 99,
              border: '1px solid',
              borderColor: selectedRegionId === null
                ? '#f97316' : 'rgba(255,255,255,0.15)',
              background: selectedRegionId === null
                ? 'rgba(249,115,22,0.15)' : 'transparent',
              color: selectedRegionId === null ? '#f97316' : '#888',
              fontSize: '0.8rem', fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            All Regions
          </button>
          {regions.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedRegionId(r.id)}
              style={{
                padding: '0.375rem 0.875rem', borderRadius: 99,
                border: '1px solid',
                borderColor: selectedRegionId === r.id
                  ? '#f97316' : 'rgba(255,255,255,0.15)',
                background: selectedRegionId === r.id
                  ? 'rgba(249,115,22,0.15)' : 'transparent',
                color: selectedRegionId === r.id ? '#f97316' : '#888',
                fontSize: '0.8rem', fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              📍 {r.name}
            </button>
          ))}
        </div>
      )}

      <LeaderboardTable entries={entries} myTeamId={teamId} />

    </div>
  )
}
