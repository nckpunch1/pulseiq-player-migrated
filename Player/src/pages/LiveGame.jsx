import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePaperLiveGame } from '../hooks/usePaperLiveGame'
import './live-game.css'

function formatSecondsAgo(secs) {
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  return `${Math.floor(secs / 60)}m ago`
}

function GameStateBadge({ state }) {
  if (state === 'live') {
    return (
      <span className="lg-badge lg-badge--live">
        <span className="lg-badge-dot" />
        LIVE
      </span>
    )
  }
  if (state === 'completed') {
    return <span className="lg-badge lg-badge--completed">COMPLETED</span>
  }
  return <span className="lg-badge lg-badge--scheduled">SCHEDULED</span>
}

export default function LiveGame() {
  const { gameId } = useParams()

  const {
    lastKnownGoodState,
    isReconnecting,
    lastUpdatedAt,
    consecutiveFailures,
    loading,
  } = usePaperLiveGame(gameId)

  // Force re-render every second so "Updated X ago" stays live
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const d = lastKnownGoodState
  const gameState = d?.game_state
  const myTeam = d?.my_team
  const currentRound = d?.current_round
  const leaderboard = d?.leaderboard ?? []
  const roundScores = d?.round_scores ?? []
  const showLeaderboard = d?.show_leaderboard && leaderboard.length > 0

  const secsAgo = lastUpdatedAt
    ? Math.floor((Date.now() - lastUpdatedAt.getTime()) / 1000)
    : null

  // ── Loading skeleton ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="lg-page">
        <header className="lg-header">
          <Link to={`/games/${gameId}`} className="lg-back">← Back</Link>
          <div className="lg-header-center">
            <div className="lg-skel lg-skel--title" />
            <div className="lg-skel lg-skel--sub" />
          </div>
        </header>
        <div className="lg-skel-stack">
          <div className="lg-skel lg-skel--card" />
          <div className="lg-skel lg-skel--card" />
          <div className="lg-skel lg-skel--card-sm" />
        </div>
      </div>
    )
  }

  // ── No team ──────────────────────────────────────────────────────
  if (!myTeam) {
    return (
      <div className="lg-page">
        <header className="lg-header">
          <Link to={`/games/${gameId}`} className="lg-back">← Back</Link>
          <div className="lg-header-center">
            <p className="lg-game-title">{d?.game_title ?? 'Live Game'}</p>
            {d?.venue && <p className="lg-game-venue">{d.venue}</p>}
          </div>
          {gameState && <GameStateBadge state={gameState} />}
        </header>
        <div className="lg-state-fill">
          <div className="lg-info-card">
            Create or join a team to participate in live games.
          </div>
        </div>
      </div>
    )
  }

  // ── Not registered ───────────────────────────────────────────────
  const isRegistered =
    d?.registration_status === 'confirmed' || d?.registration_status === 'registered'
  if (!isRegistered) {
    return (
      <div className="lg-page">
        <header className="lg-header">
          <Link to={`/games/${gameId}`} className="lg-back">← Back</Link>
          <div className="lg-header-center">
            <p className="lg-game-title">{d?.game_title ?? 'Live Game'}</p>
            {d?.venue && <p className="lg-game-venue">{d.venue}</p>}
          </div>
          <GameStateBadge state={gameState} />
        </header>
        <div className="lg-state-fill">
          <div className="lg-info-card">
            Your team is not registered for this game.
          </div>
        </div>
      </div>
    )
  }

  // ── Full render ──────────────────────────────────────────────────
  return (
    <div className="lg-page">

      {/* ── Header ── */}
      <header className="lg-header">
        <Link to={`/games/${gameId}`} className="lg-back">← Back</Link>
        <div className="lg-header-center">
          <p className="lg-game-title">{d.game_title}</p>
          <p className="lg-game-venue">{d.venue}</p>
        </div>
        <GameStateBadge state={gameState} />
      </header>

      {/* ── Reconnection bar ── */}
      {isReconnecting && (
        <div className="lg-reconnect-bar">
          {consecutiveFailures >= 3
            ? 'Connection lost — showing last known state'
            : '⚠ Reconnecting...'}
        </div>
      )}

      {/* ── SCHEDULED ── */}
      {gameState === 'scheduled' && (
        <div className="lg-waiting">
          <span className="lg-waiting-icon">⚡</span>
          <p className="lg-waiting-title">Waiting for host to start the game</p>
          <p className="lg-waiting-sub">This screen will update automatically</p>
        </div>
      )}

      {/* ── LIVE ── */}
      {gameState === 'live' && (
        <>
          {/* Round card */}
          <section className="lg-section">
            <div className="lg-round-card">
              {currentRound ? (
                <>
                  <p className="lg-round-label">
                    ROUND {currentRound.number} OF {currentRound.total_rounds}
                  </p>
                  <h2 className="lg-round-name">{currentRound.name}</h2>
                  {currentRound.description && (
                    <p className="lg-round-desc">{currentRound.description}</p>
                  )}
                  <span className="lg-round-qtag">{currentRound.question_count} questions</span>
                </>
              ) : (
                <p className="lg-round-waiting">Waiting for host to start the next round…</p>
              )}
            </div>
          </section>

          {/* My team score */}
          <section className="lg-section">
            <div className="lg-score-card">
              <p className="lg-score-team">{myTeam.team_name}</p>
              <p className="lg-score-big">{myTeam.total_score}</p>
              {myTeam.current_rank && (
                <span className="lg-rank-tag">RANK #{myTeam.current_rank}</span>
              )}
              {myTeam.current_round_score > 0 && (
                <p className="lg-round-score-sub">Round score: {myTeam.current_round_score} pts</p>
              )}
            </div>
          </section>

          {/* Round-by-round scores */}
          {roundScores.length > 0 && (
            <section className="lg-section">
              <p className="lg-section-title">ROUND SCORES</p>
              <div className="lg-round-table">
                {[...roundScores].reverse().map(rs => (
                  <div key={rs.round_number} className="lg-round-row">
                    <span className="lg-round-row-name">{rs.round_name}</span>
                    <span className="lg-round-row-score">{rs.score}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Leaderboard */}
          {showLeaderboard && (
            <section className="lg-section">
              <p className="lg-section-title">LEADERBOARD</p>
              <div className="lg-leaderboard">
                {leaderboard.map(entry => (
                  <div
                    key={entry.rank}
                    className={`lg-lb-row${entry.is_my_team ? ' lg-lb-row--mine' : ''}`}
                  >
                    <span className="lg-lb-rank">
                      {entry.rank === 1 ? '🏆' : `#${entry.rank}`}
                    </span>
                    <span className="lg-lb-name">{entry.team_name}</span>
                    <span className="lg-lb-score">{entry.total_score}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── COMPLETED ── */}
      {gameState === 'completed' && (
        <>
          <div className="lg-gameover">
            <h1 className="lg-gameover-heading">GAME OVER</h1>
          </div>

          <section className="lg-section">
            <p className="lg-section-title">FINAL LEADERBOARD</p>
            <div className="lg-leaderboard">
              {leaderboard.map(entry => (
                <div
                  key={entry.rank}
                  className={`lg-lb-row${entry.is_my_team ? ' lg-lb-row--mine' : ''}`}
                >
                  <span className="lg-lb-rank">
                    {entry.rank === 1 ? '🏆' : `#${entry.rank}`}
                  </span>
                  <span className="lg-lb-name">{entry.team_name}</span>
                  <span className="lg-lb-score">{entry.total_score}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="lg-section">
            <div className="lg-final-card">
              <p className="lg-score-team">{myTeam.team_name}</p>
              <p className="lg-score-big">{myTeam.total_score}</p>
              {myTeam.current_rank && (
                <span className="lg-rank-tag">RANK #{myTeam.current_rank}</span>
              )}
            </div>
          </section>

          {roundScores.length > 0 && (
            <section className="lg-section">
              <p className="lg-section-title">ROUND SCORES</p>
              <div className="lg-round-table">
                {[...roundScores].reverse().map(rs => (
                  <div key={rs.round_number} className="lg-round-row">
                    <span className="lg-round-row-name">{rs.round_name}</span>
                    <span className="lg-round-row-score">{rs.score}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="lg-thanks">Thanks for playing! See you next time.</p>

          <Link to="/dashboard" className="lg-dash-btn">
            Back to Dashboard
          </Link>
        </>
      )}

      {/* ── Updated timestamp ── */}
      {!isReconnecting && secsAgo !== null && (
        <p className="lg-updated-at">Updated {formatSecondsAgo(secsAgo)}</p>
      )}

    </div>
  )
}
