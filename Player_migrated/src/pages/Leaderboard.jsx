import { useState, useEffect, useMemo, useRef } from 'react'
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

// The view this screen renders is composed from two separately-cached reads, so
// the seed has to be composed too. Returns undefined unless every piece is
// present — a half-seeded view would render as an empty table, which is a worse
// lie than the loading state.
function peekLeaderboardView() {
  const lb = api.peekLeaderboards()
  if (!lb) return undefined
  const season = lb.current_season
  const seasonEntries = season ? api.peekSeasonLeaderboard(season.id, lb.region_id) : []
  if (seasonEntries === undefined) return undefined
  return {
    current_season: season,
    current_season_leaderboard: seasonEntries,
    all_time_leaderboard: lb.all_time_leaderboard ?? [],
  }
}

export default function Leaderboard() {
  // undefined = not known yet, null = known to have no team. Seeded from cache
  // so a returning teamless user gets the "Join a team" panel on the first
  // render instead of a leaderboard that is about to be replaced.
  const [teamId, setTeamId] = useState(() => api.peekTeamId())
  // Last-known view for the default region, rendered immediately so navigating
  // back to this tab doesn't blank. undefined => nothing cached => real load.
  const seed = useMemo(() => peekLeaderboardView(), [])
  const [data, setData] = useState(seed ?? null)
  const [error, setError] = useState('')
  const hasContent = useRef(seed !== undefined)
  const [tab, setTab] = useState('season') // season | alltime
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    api.getTeamId()
      .then(id => setTeamId(id ?? null))
      .catch(() => setTeamId(null))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Always the player's own team region: leaderboards are game data, and the
      // regional rules let a player read only their team's region.
      const lbData = await api.getLeaderboards()

      let seasonEntries = []
      if (lbData.current_season && lbData.region_id) {
        seasonEntries = await api.getSeasonLeaderboard(lbData.current_season.id, lbData.region_id)
      }

      if (cancelled) return
      setData({
        current_season: lbData.current_season,
        current_season_leaderboard: seasonEntries,
        all_time_leaderboard: lbData.all_time_leaderboard ?? [],
      })
      hasContent.current = true
    }

    // Seed from cache so navigating back to this tab stays instant.
    const regionSeed = peekLeaderboardView()
    hasContent.current = regionSeed !== undefined
    setData(regionSeed ?? null)
    setError('')

    load()
      .catch(err => {
        if (cancelled) return
        // A failed refresh must never wipe a table already on screen.
        if (!hasContent.current) setError(err.message ?? 'Failed to load leaderboard.')
      })

    return () => { cancelled = true }
  }, [retryCount])

  // Spinner only when there is genuinely nothing correct to show. `data` covers
  // the table itself — a separate `loading` flag would say nothing this doesn't,
  // since the revalidate runs invisibly underneath whatever is already rendered.
  // `teamId` is back in the gate now that it seeds from cache: without it a
  // teamless user gets a table that the very next render replaces with the
  // "Join a team" panel. Both seed after the first visit, so this only holds on
  // a genuine first load. Phrased on `data` so the destructure below is safe.
  if ((!data || teamId === undefined) && !error) {
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
  const rawEntries = tab === 'season' ? (current_season_leaderboard ?? []) : (all_time_leaderboard ?? [])
  // The service layer now excludes orphaned/inactive teams structurally (join to
  // /teams), so the component is a dumb renderer. Re-rank sequentially so the
  // displayed positions have no gaps.
  const entries = rawEntries
    .map((e, i) => ({ ...e, rank: i + 1 }))

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

      <LeaderboardTable entries={entries} myTeamId={teamId} />

    </div>
  )
}
