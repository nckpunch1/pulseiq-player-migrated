import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import './team.css'

export default function Team() {
  const { setSessionFromResponse } = useAuth()
  const [searchParams] = useSearchParams()

  const [loadState, setLoadState] = useState('loading') // loading | error | no-team | has-team
  const [teamData, setTeamData] = useState(null)        // { team, membership, members }
  const [joinRequests, setJoinRequests] = useState([])
  const [pageError, setPageError] = useState('')

  // ── No-team panel state
  const initialTab = searchParams.get('tab') === 'search' ? 'search' : 'create'
  const [noTeamTab, setNoTeamTab] = useState(initialTab)  // create | search
  const [createName, setCreateName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [sentRequests, setSentRequests] = useState({})  // teamId → true when requested
  const [joinBusyId, setJoinBusyId] = useState(null)

  // ── Captain: join request handling
  const [handlingId, setHandlingId] = useState(null)

  // ── Leave
  const [leaveBusy, setLeaveBusy] = useState(false)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoadState('loading')
    setPageError('')
    try {
      const data = await api.getTeam()
      if (!data.team) {
        setLoadState('no-team')
        return
      }
      setTeamData(data)
      setLoadState('has-team')
      if (data.membership?.is_captain) {
        try {
          const rData = await api.getJoinRequests(data.team.id)
          setJoinRequests(rData.requests ?? [])
        } catch { /* non-critical */ }
      }
    } catch (err) {
      setPageError(err.message ?? 'Failed to load team.')
      setLoadState('error')
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    const name = createName.trim()
    if (!name) return
    setCreateBusy(true)
    setCreateError('')
    try {
      const data = await api.createTeam(name)
      setSessionFromResponse(data)
      await load()
    } catch (err) {
      setCreateError(err.message ?? 'Failed to create team.')
      setCreateBusy(false)
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    setSearchBusy(true)
    setSearchError('')
    setSearchResults(null)
    try {
      const data = await api.searchTeams(q)
      setSearchResults(data.teams ?? [])
    } catch (err) {
      setSearchError(err.message ?? 'Search failed.')
    } finally {
      setSearchBusy(false)
    }
  }

  async function handleJoin(teamId) {
    setJoinBusyId(teamId)
    try {
      await api.requestToJoin(teamId)
      setSentRequests(prev => ({ ...prev, [teamId]: true }))
    } catch {
      // swallow — the button stays enabled for a retry
    } finally {
      setJoinBusyId(null)
    }
  }

  async function handleJoinRequest(requestId, action) {
    setHandlingId(requestId)
    try {
      const data = await api.handleJoinRequest(requestId, action)
      setJoinRequests(prev => prev.filter(r => r.id !== requestId))
      if (data.members) {
        setTeamData(prev => ({ ...prev, members: data.members }))
      }
    } catch {
      // swallow — request remains in list for retry
    } finally {
      setHandlingId(null)
    }
  }

  async function handleLeave() {
    setLeaveBusy(true)
    setPageError('')
    try {
      const data = await api.leaveTeam(teamData.team.id)
      setSessionFromResponse(data)
      await load()
    } catch (err) {
      setPageError(err.message ?? 'Failed to leave team.')
    } finally {
      setLeaveBusy(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loadState === 'loading') {
    return (
      <div className="team-page">
        <div className="team-state-fill">
          <p className="team-loading-text">Loading…</p>
        </div>
      </div>
    )
  }

  // ── Full-page error ────────────────────────────────────────────────────────

  if (loadState === 'error') {
    return (
      <div className="team-page">
        <div className="team-state-fill">
          <div className="team-error-box">{pageError}</div>
        </div>
      </div>
    )
  }

  // ── No team ────────────────────────────────────────────────────────────────

  if (loadState === 'no-team') {
    return (
      <div className="team-page">
        <header className="team-header">
          <Link to="/dashboard" className="team-back">← Dashboard</Link>
          <p className="team-wordmark">QuizPulse</p>
          <h1 className="team-page-title">Your Team</h1>
          <p className="team-page-subtitle">Create a team or request to join one.</p>
        </header>

        <div className="team-tab-row">
          <button
            className={`team-tab${noTeamTab === 'create' ? ' team-tab--active' : ''}`}
            onClick={() => setNoTeamTab('create')}
          >
            Create a Team
          </button>
          <button
            className={`team-tab${noTeamTab === 'search' ? ' team-tab--active' : ''}`}
            onClick={() => setNoTeamTab('search')}
          >
            Find &amp; Join
          </button>
        </div>

        {noTeamTab === 'create' && (
          <section className="team-section">
            <p className="team-section-title">New Team</p>
            <div className="team-card">
              {createError && <div className="team-error-banner">{createError}</div>}
              <form onSubmit={handleCreate} className="team-form">
                <div className="team-field">
                  <label className="team-label" htmlFor="team-name-input">Team Name</label>
                  <input
                    id="team-name-input"
                    className="team-input"
                    type="text"
                    placeholder="e.g. Danger Noodles"
                    value={createName}
                    onChange={e => setCreateName(e.target.value)}
                    disabled={createBusy}
                    maxLength={64}
                    autoFocus
                  />
                </div>
                <button
                  className="team-btn team-btn--primary"
                  type="submit"
                  disabled={createBusy || !createName.trim()}
                >
                  {createBusy ? 'Creating…' : 'Create Team'}
                </button>
              </form>
            </div>
          </section>
        )}

        {noTeamTab === 'search' && (
          <section className="team-section">
            <p className="team-section-title">Search Teams</p>
            <div className="team-card">
              {searchError && <div className="team-error-banner">{searchError}</div>}
              <form onSubmit={handleSearch} className="team-search-row">
                <input
                  className="team-input team-input--flex"
                  type="text"
                  placeholder="Search by team name…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  disabled={searchBusy}
                />
                <button
                  className="team-btn team-btn--primary team-btn--compact"
                  type="submit"
                  disabled={searchBusy || !searchQuery.trim()}
                >
                  {searchBusy ? '…' : 'Search'}
                </button>
              </form>
            </div>

            {searchResults !== null && (
              <div className="team-results-list">
                {searchResults.length === 0 ? (
                  <p className="team-empty">No teams found for &ldquo;{searchQuery}&rdquo;.</p>
                ) : (
                  searchResults.map(t => (
                    <div key={t.id} className="team-result-card">
                      <div className="team-result-info">
                        <span className="team-result-name">{t.name}</span>
                        <span className="team-result-meta">
                          {t.member_count} {t.member_count === 1 ? 'member' : 'members'} · Captain: {t.captain_name}
                        </span>
                      </div>
                      {sentRequests[t.id] ? (
                        <span className="team-badge team-badge--pending">Requested</span>
                      ) : (
                        <button
                          className="team-btn team-btn--ghost team-btn--compact"
                          onClick={() => handleJoin(t.id)}
                          disabled={joinBusyId === t.id}
                        >
                          {joinBusyId === t.id ? '…' : 'Request to Join'}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        )}
      </div>
    )
  }

  // ── Has team ───────────────────────────────────────────────────────────────

  const { team, membership, members } = teamData
  const isCaptain = membership?.is_captain ?? false
  const pendingCount = joinRequests.length
  const memberCount = members?.length ?? team.member_count ?? 0

  return (
    <div className="team-page">

      {/* ── Header ── */}
      <header className="team-header">
        <Link to="/dashboard" className="team-back">← Dashboard</Link>
        <p className="team-wordmark">QuizPulse</p>
        <div className="team-name-row">
          <h1 className="team-page-title">{team.name}</h1>
          {isCaptain && <span className="team-badge team-badge--captain">Captain</span>}
        </div>
        <p className="team-page-subtitle">
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </p>
      </header>

      {/* ── Members ── */}
      <section className="team-section">
        <p className="team-section-title">Members</p>
        {pageError && <div className="team-error-banner team-error-banner--mb">{pageError}</div>}
        <div className="team-card team-card--flush">
          {members?.length ? (
            members.map((m, i) => (
              <div
                key={m.player_id}
                className={[
                  'team-member-row',
                  m.is_captain ? 'team-member-row--captain' : '',
                  i < members.length - 1 ? 'team-member-row--bordered' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="team-member-info">
                  <span className="team-member-name">
                    {m.player_name || m.display_name || m.username || `Player ${String(m.player_id).slice(0, 6)}`}
                  </span>
                  <div className="team-member-badges">
                    {m.is_captain && <span className="team-badge team-badge--captain">Captain</span>}
                    {m.is_scribe && <span className="team-badge team-badge--scribe">Scribe</span>}
                  </div>
                </div>
                <div className="team-member-actions">
                  {m.player_id === membership?.player_id && (
                    <button
                      className="team-btn team-btn--danger-ghost team-btn--compact"
                      onClick={handleLeave}
                      disabled={leaveBusy}
                    >
                      {leaveBusy ? '…' : 'Leave Team'}
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="team-empty team-empty--inset">No members.</p>
          )}
        </div>
      </section>

      {/* ── Join requests (captain only) ── */}
      {isCaptain && (
        <section className="team-section">
          <div className="team-section-title-row">
            <p className="team-section-title">Join Requests</p>
            {pendingCount > 0 && (
              <span className="team-notif-badge">{pendingCount}</span>
            )}
          </div>
          {joinRequests.length === 0 ? (
            <p className="team-empty">No pending requests.</p>
          ) : (
            <div className="team-card team-card--flush">
              {joinRequests.map((r, i) => (
                <div
                  key={r.id}
                  className={`team-request-row${i < joinRequests.length - 1 ? ' team-request-row--bordered' : ''}`}
                >
                  <div className="team-request-info">
                    <span className="team-member-name">{r.player_name}</span>
                    <span className="team-member-meta">@{r.player_username}</span>
                  </div>
                  <div className="team-request-actions">
                    <button
                      className="team-btn team-btn--approve team-btn--compact"
                      onClick={() => handleJoinRequest(r.id, 'approved')}
                      disabled={handlingId === r.id}
                    >
                      Approve
                    </button>
                    <button
                      className="team-btn team-btn--reject team-btn--compact"
                      onClick={() => handleJoinRequest(r.id, 'rejected')}
                      disabled={handlingId === r.id}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}


    </div>
  )
}
