import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { collection, collectionGroup, doc, documentId, onSnapshot, query, where } from 'firebase/firestore'
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
    let cancelled = false
    const unsubs = []

    function mapStatus(attendanceStatus) {
      if (attendanceStatus === 'checked_in') return 'checked_in'
      if (attendanceStatus === 'no_show') return 'no_show'
      if (attendanceStatus === 'confirmed' || attendanceStatus === 'attending' || attendanceStatus === 'present') return 'confirmed'
      if (attendanceStatus === 'confirmation_requested' || attendanceStatus === 'attendance_requested') return 'confirmation_requested'
      return 'registered'
    }

    // Applies a registration doc (or its absence) to the matching game row.
    function applyRegistrations(bySessionId) {
      setGames(prev => prev.map(g => {
        const reg = bySessionId.get(g.canonical_session_id)
        if (!reg) return { ...g, registration_status: 'not_registered', team_name: null }
        return { ...g, registration_status: mapStatus(reg.attendanceStatus), team_name: reg.teamName ?? g.team_name }
      }))
    }

    api.getGames()
      .then(data => {
        if (cancelled) return
        const initialGames = data.games ?? []
        setGames(initialGames)
        setLoading(false)

        const teamId = initialGames.find(g => g.team_id)?.team_id ?? null
        const sessionIds = initialGames.map(g => g.canonical_session_id).filter(Boolean)

        // Session status (goes live, completes, sells out) via one listener per
        // batch of 30 ids — Firestore's `in` limit — rather than one per session.
        // Filtering on documentId rather than status keeps the doc set fixed, so a
        // session that completes still reports its new status instead of dropping
        // out of the query and vanishing from the list.
        for (let i = 0; i < sessionIds.length; i += 30) {
          const idBatch = sessionIds.slice(i, i + 30)
          unsubs.push(onSnapshot(
            query(collection(firestore, 'sessions'), where(documentId(), 'in', idBatch)),
            (snap) => {
              const byId = new Map(snap.docs.map(d => [d.id, d.data()]))
              setGames(prev => prev.map(g => {
                const data = byId.get(g.canonical_session_id)
                if (!data) return g
                return { ...g, status: data.status, soldOut: data.soldOut === true }
              }))
            }
          ))
        }

        // Registration status (confirmation_requested, checked_in, etc.) for every
        // session at once. One collection-group subscription replaces the previous
        // one-listener-per-session fan-out; liveness is unchanged, so a team that
        // just registered still self-corrects without a refetch.
        if (teamId) {
          unsubs.push(onSnapshot(
            query(collectionGroup(firestore, 'registrations'), where('teamId', '==', teamId)),
            (snap) => {
              const bySessionId = new Map()
              for (const d of snap.docs) {
                const sessionId = d.ref.parent.parent?.id
                if (sessionId) bySessionId.set(sessionId, d.data())
              }
              applyRegistrations(bySessionId)
            },
            (err) => {
              // The collection-group query needs a `registrations.teamId` index. If
              // it is missing (or rules reject the group read) fall back to the old
              // per-session listeners so registration status stays live.
              console.error('[Games] registration collection-group listener failed, falling back per session:', err)
              if (cancelled) return
              for (const sessionId of sessionIds) {
                unsubs.push(onSnapshot(
                  doc(firestore, 'sessions', sessionId, 'registrations', teamId),
                  (regSnap) => {
                    setGames(prev => prev.map(g => {
                      if (g.canonical_session_id !== sessionId) return g
                      if (!regSnap.exists()) return { ...g, registration_status: 'not_registered', team_name: null }
                      const reg = regSnap.data()
                      return { ...g, registration_status: mapStatus(reg.attendanceStatus), team_name: reg.teamName ?? g.team_name }
                    }))
                  }
                ))
              }
            }
          ))
        }
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message ?? 'Failed to load games.')
        setLoading(false)
      })

    return () => {
      cancelled = true
      for (const unsub of unsubs) unsub()
      unsubs.length = 0
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
                    {game.soldOut && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        color: '#ef4444',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: 99,
                        letterSpacing: '0.05em',
                        marginLeft: '0.5rem',
                      }}>
                        SOLD OUT
                      </span>
                    )}
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
                    $35 per person
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
                  {game.soldOut && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      color: '#ef4444',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      borderRadius: 99,
                      letterSpacing: '0.05em',
                      marginLeft: '0.5rem',
                    }}>
                      SOLD OUT
                    </span>
                  )}
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
