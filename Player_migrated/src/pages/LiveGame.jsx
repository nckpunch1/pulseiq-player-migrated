import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ref, set, serverTimestamp } from 'firebase/database'
import { db } from '../lib/firebase'
import { usePaperLiveGame } from '../hooks/usePaperLiveGame'
import { usePulseSession } from '../hooks/usePulseSession'
import { api } from '../api/client'
import './live-game.css'

function formatSecondsAgo(secs) {
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  return `${Math.floor(secs / 60)}m ago`
}

function GameStateBadge({ status }) {
  if (status === 'live') {
    return (
      <span className="lg-badge lg-badge--live">
        <span className="lg-badge-dot" />
        LIVE
      </span>
    )
  }
  if (status === 'completed') {
    return <span className="lg-badge lg-badge--completed">COMPLETED</span>
  }
  return <span className="lg-badge lg-badge--scheduled">SCHEDULED</span>
}

function TeamScoreCard({ team, teamScore }) {
  return (
    <section className="lg-section">
      <div className="lg-score-card">
        <p className="lg-score-team">{team?.name}</p>
        <p className="lg-score-big">{teamScore?.score ?? 0}</p>
        {teamScore?.rank && (
          <span className="lg-rank-tag">RANK #{teamScore.rank}</span>
        )}
      </div>
    </section>
  )
}

const GAME_TYPE_LABELS = {
  blitz: 'SUDDEN DEATH BLITZ',
  closest_answer: 'CLOSEST ANSWER CHALLENGE',
  beer_game: 'BEER GAME',
  bonus_question: 'BONUS QUESTION',
}

function PulseBranding() {
  return (
    <div className="pulse-branding">
      <span className="pulse-logo-icon">⚡</span>
      <span className="pulse-logo-text">PulseIQ</span>
    </div>
  )
}

function PulseTapScreen({ pulseSessionId, teamId, teamName }) {
  const [hasTapped, setHasTapped] = useState(false)

  useEffect(() => {
    setHasTapped(false)
  }, [pulseSessionId])

  async function handleTap() {
    if (!pulseSessionId || !teamId || hasTapped) return
    setHasTapped(true)
    const tapRef = ref(db, `pulseSessions/${pulseSessionId}/taps/${teamId}`)
    await set(tapRef, { teamId, teamName, tappedAt: serverTimestamp() })
  }

  return (
    <div className="pulse-overlay pulse-overlay--fullscreen">
      <PulseBranding />
      <p className="pulse-team-label">{teamName}</p>
      <button
        className={`pulse-tap-btn${hasTapped ? ' pulse-tap-btn--tapped' : ''}`}
        onClick={handleTap}
        disabled={hasTapped}
      >
        {hasTapped ? '⚡ Tapped!' : 'TAP'}
      </button>
    </div>
  )
}

function PulseRevealScreen({ pulseSession }) {
  const { state, gameType, winnerName } = pulseSession
  const isWinnerGame = gameType === 'beer_game' || gameType === 'bonus_question'
  const isGameTypeReveal = gameType === 'blitz' || gameType === 'closest_answer'
  const showWinner = state === 'revealed' && isWinnerGame && winnerName
  const showGameType = state === 'revealed' && isGameTypeReveal

  return (
    <div className="pulse-overlay">
      <PulseBranding />
      {showWinner ? (
        <div className="pulse-winner-wrap">
          <span className="pulse-winner-trophy">🏆</span>
          <p className="pulse-winner-label">WINNER</p>
          <p className="pulse-winner-name">{winnerName}</p>
        </div>
      ) : showGameType ? (
        <p className="pulse-reveal-game-type">{GAME_TYPE_LABELS[gameType]}</p>
      ) : (
        <p className="pulse-standby">Stand by...</p>
      )}
    </div>
  )
}

function PulseQuestionScreen({ pulseSession }) {
  const { gameType, currentGame } = pulseSession
  return (
    <div className="pulse-overlay">
      <PulseBranding />
      <p className="pulse-game-type-label">{GAME_TYPE_LABELS[gameType] ?? gameType}</p>
      {currentGame?.question && (
        <p className="pulse-question-text">{currentGame.question}</p>
      )}
    </div>
  )
}

function PulseAnswerScreen({ pulseSession, pulseSessionId, teamId, teamName }) {
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    setAnswer('')
    setSubmitted(false)
  }, [pulseSessionId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!pulseSessionId || !teamId || submitted || answer === '') return
    const parsed = Number(answer)
    if (isNaN(parsed)) return
    setSubmitted(true)
    const answerRef = ref(db, `pulseSessions/${pulseSessionId}/answers/${teamId}`)
    await set(answerRef, { teamId, teamName, answer: parsed })
  }

  return (
    <div className="pulse-overlay">
      <PulseBranding />
      <p className="pulse-game-type-label">CLOSEST ANSWER CHALLENGE</p>
      {pulseSession.currentGame?.question && (
        <p className="pulse-question-text">{pulseSession.currentGame.question}</p>
      )}
      {submitted ? (
        <p className="pulse-submitted-msg">Answer submitted!</p>
      ) : (
        <form className="pulse-answer-form" onSubmit={handleSubmit}>
          <input
            className="pulse-answer-input"
            type="number"
            inputMode="numeric"
            placeholder="Your answer"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            disabled={submitted}
            autoFocus
          />
          <button
            className="pulse-answer-btn"
            type="submit"
            disabled={submitted || answer === ''}
          >
            SUBMIT
          </button>
        </form>
      )}
    </div>
  )
}

function PulseBlitzScreen({ pulseSession }) {
  const { currentGame } = pulseSession
  const questions = currentGame?.questions ?? []
  const idx = currentGame?.currentQuestionIndex ?? 0
  const q = questions[idx]

  return (
    <div className="pulse-overlay">
      <PulseBranding />
      <p className="pulse-game-type-label">SUDDEN DEATH BLITZ</p>
      {q ? (
        <>
          <p className="pulse-blitz-counter">Question {idx + 1} of {questions.length}</p>
          <p className="pulse-question-text">{q.question}</p>
          <div className="pulse-blitz-choices">
            <div className="pulse-blitz-choice">
              <span className="pulse-blitz-choice-label">A</span>
              <span className="pulse-blitz-choice-text">{q.choiceA}</span>
            </div>
            <div className="pulse-blitz-choice">
              <span className="pulse-blitz-choice-label">B</span>
              <span className="pulse-blitz-choice-text">{q.choiceB}</span>
            </div>
          </div>
        </>
      ) : (
        <p className="pulse-standby">Stand by...</p>
      )}
    </div>
  )
}

function PulseOverlay({ pulseSession, pulseSessionId, teamId, teamName }) {
  const { state, gameType } = pulseSession

  if (state === 'active') {
    return (
      <PulseTapScreen
        pulseSessionId={pulseSessionId}
        teamId={teamId}
        teamName={teamName}
      />
    )
  }

  if (state === 'revealing' || state === 'revealed') {
    return <PulseRevealScreen pulseSession={pulseSession} />
  }

  if (state === 'game_active') {
    if (gameType === 'closest_answer') {
      return (
        <PulseAnswerScreen
          pulseSession={pulseSession}
          pulseSessionId={pulseSessionId}
          teamId={teamId}
          teamName={teamName}
        />
      )
    }
    if (gameType === 'blitz') {
      return <PulseBlitzScreen pulseSession={pulseSession} />
    }
    return <PulseQuestionScreen pulseSession={pulseSession} />
  }

  return null
}

export default function LiveGame() {
  const { gameId } = useParams()

  const {
    lastKnownGoodState,
    teamId: liveTeamId,
    isReconnecting,
    lastUpdatedAt,
    consecutiveFailures,
    loading: rtdbLoading,
  } = usePaperLiveGame(gameId)

  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(true)

  useEffect(() => {
    if (!gameId) return
    api.getGameDetails(gameId)
      .then(data => setDetail(data))
      .catch(() => {})
      .finally(() => setDetailLoading(false))
  }, [gameId])

  // Force re-render every second so "Updated X ago" stays live
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Pulse session — must be called before any early return
  const pulseTeamId = detail?.team?.id ?? liveTeamId
  const { sessionData: pulseSession, sessionId: pulseSessionId } = usePulseSession(pulseTeamId)
  const isPulseActive = pulseSession != null &&
    pulseSession.state !== 'setup' &&
    pulseSession.state !== 'complete'

  const loading = detailLoading || rtdbLoading

  const d = lastKnownGoodState
  const liveState = d?.status ?? null
  const STATUS_BADGE_MAP = {
    lobby: 'live',
    paper_round_active: 'live',
    round_results: 'live',
    round_results_revealed: 'live',
    game_complete: 'completed',
  }
  const gameStatus = STATUS_BADGE_MAP[d?.status] ?? 'live'
  const currentRound = d?.currentRound
  const teamId = detail?.team?.id ?? d?.team?.id
  const leaderboardRaw = d?.leaderboard
  const leaderboard = leaderboardRaw && !Array.isArray(leaderboardRaw)
    ? Object.entries(leaderboardRaw)
        .map(([id, data]) => ({ teamId: id, ...data }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .map((entry, i) => ({ ...entry, rank: entry.rank ?? i + 1 }))
    : (Array.isArray(leaderboardRaw) ? leaderboardRaw : [])
  const roundScores = d?.round_scores ?? []

  const isLobby = !liveState || liveState === 'lobby'

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
  if (!detail?.team && !detail?.registration) {
    return (
      <div className="lg-page">
        <header className="lg-header">
          <Link to={`/games/${gameId}`} className="lg-back">← Back</Link>
          <div className="lg-header-center">
            <p className="lg-game-title">{d?.game?.title ?? 'Live Game'}</p>
            {d?.game?.venue && <p className="lg-game-venue">{d.game.venue}</p>}
          </div>
          {gameStatus && <GameStateBadge status={gameStatus} />}
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
  const isRegistered = !!detail?.registration
  if (!isRegistered) {
    return (
      <div className="lg-page">
        <header className="lg-header">
          <Link to={`/games/${gameId}`} className="lg-back">← Back</Link>
          <div className="lg-header-center">
            <p className="lg-game-title">{d?.game?.title ?? 'Live Game'}</p>
            {d?.game?.venue && <p className="lg-game-venue">{d.game.venue}</p>}
          </div>
          <GameStateBadge status={gameStatus} />
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
          <p className="lg-game-title">{d.game?.title}</p>
          <p className="lg-game-venue">{d.game?.venue}</p>
        </div>
        <GameStateBadge status={gameStatus} />
      </header>

      {/* ── Reconnection bar ── */}
      {isReconnecting && (
        <div className="lg-reconnect-bar">
          {consecutiveFailures >= 3
            ? 'Connection lost — showing last known state'
            : '⚠ Reconnecting...'}
        </div>
      )}

      {/* ── PULSE SESSION ACTIVE ── */}
      {isPulseActive && (
        <PulseOverlay
          pulseSession={pulseSession}
          pulseSessionId={pulseSessionId}
          teamId={teamId}
          teamName={detail?.team?.name ?? d?.team?.name}
        />
      )}

      {/* ── LOBBY / null ── */}
      {!isPulseActive && isLobby && (
        <div className="lg-waiting">
          <span className="lg-waiting-icon">⚡</span>
          <p className="lg-waiting-title">Waiting for host to start the game</p>
          <p className="lg-waiting-sub">This screen updates automatically</p>
        </div>
      )}

      {/* ── Team score card — all states except lobby ── */}
      {!isPulseActive && !isLobby && (
        <TeamScoreCard team={detail?.team ?? d?.team} teamScore={d?.leaderboard?.[teamId]} />
      )}

      {/* ── ROUND INTRO ── */}
      {!isPulseActive && liveState === 'round_intro' && (
        <section className="lg-section">
          <div className="lg-round-card">
            {currentRound ? (
              <>
                <p className="lg-round-label">ROUND {currentRound.number}</p>
                <h2 className="lg-round-name">{currentRound.title}</h2>
                <p className="lg-round-intro-sub">Get ready — round starting soon</p>
                {currentRound.question_count && (
                  <span className="lg-round-qtag">{currentRound.question_count} questions</span>
                )}
              </>
            ) : (
              <p className="lg-round-waiting">Preparing next round...</p>
            )}
          </div>
        </section>
      )}

      {/* ── PAPER ROUND ACTIVE ── */}
      {!isPulseActive && liveState === 'paper_round_active' && (
        <section className="lg-section">
          <div className="lg-round-card">
            {currentRound ? (
              <>
                <p className="lg-round-label">ROUND {currentRound.number}</p>
                <h2 className="lg-round-name">{currentRound.title}</h2>
                {currentRound.description && (
                  <p className="lg-round-desc">{currentRound.description}</p>
                )}
                <p className="lg-round-active-sub">Round in progress — write your answers</p>
                <div className="lg-round-meta">
                  {currentRound.question_count && (
                    <span className="lg-round-qtag">{currentRound.question_count} questions</span>
                  )}
                  {currentRound.points_available && (
                    <span className="lg-round-qtag">{currentRound.points_available} pts available</span>
                  )}
                </div>
              </>
            ) : (
              <p className="lg-round-waiting">Round in progress</p>
            )}
          </div>
        </section>
      )}

      {/* ── PAPER SCORING ── */}
      {!isPulseActive && liveState === 'paper_scoring' && (
        <div className="lg-waiting">
          <p className="lg-waiting-title">Host is entering scores...</p>
        </div>
      )}

      {/* ── ROUND RESULTS ── */}
      {!isPulseActive && liveState === 'round_results' && (
        <>
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
          {leaderboard.length > 0 && (
            <section className="lg-section">
              <p className="lg-section-title">LEADERBOARD</p>
              <div className="lg-leaderboard">
                {leaderboard.map(entry => (
                  <div
                    key={entry.teamId}
                    className={`lg-lb-row${entry.teamId === teamId ? ' lg-lb-row--mine' : ''}`}
                  >
                    <span className="lg-lb-rank">
                      {entry.rank === 1 ? '🏆' : `#${entry.rank}`}
                    </span>
                    <span className="lg-lb-name">{entry.teamName}</span>
                    <span className="lg-lb-score">{entry.score}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <p className="lg-results-sub">Next round starting soon...</p>
        </>
      )}

      {/* ── ROUND RESULTS REVEALED ── */}
      {!isPulseActive && liveState === 'round_results_revealed' && (
        <>
          <div className="lg-lb-heading-wrap">
            <h2 className="lg-lb-heading">LEADERBOARD</h2>
          </div>
          {leaderboard.length > 0 && (
            <section className="lg-section">
              <div className="lg-leaderboard">
                {leaderboard.map(entry => (
                  <div
                    key={entry.teamId}
                    className={`lg-lb-row${entry.teamId === teamId ? ' lg-lb-row--mine' : ''}`}
                  >
                    <span className="lg-lb-rank">
                      {entry.rank === 1 ? '🏆' : `#${entry.rank}`}
                    </span>
                    <span className="lg-lb-name">{entry.teamName}</span>
                    <span className="lg-lb-score">{entry.score}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <p className="lg-results-sub">Next round starting soon...</p>
        </>
      )}

      {/* ── LEADERBOARD ── */}
      {!isPulseActive && liveState === 'leaderboard' && (
        <>
          <div className="lg-lb-heading-wrap">
            <h2 className="lg-lb-heading">LEADERBOARD</h2>
          </div>
          <section className="lg-section">
            <div className="lg-leaderboard">
              {leaderboard.map(entry => (
                <div
                  key={entry.teamId}
                  className={`lg-lb-row${entry.teamId === teamId ? ' lg-lb-row--mine' : ''}`}
                >
                  <span className="lg-lb-rank">
                    {entry.rank === 1 ? '🏆' : `#${entry.rank}`}
                  </span>
                  <span className="lg-lb-name">{entry.teamName}</span>
                  <span className="lg-lb-score">{entry.score}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── FINISHED ── */}
      {!isPulseActive && liveState === 'finished' && (
        <>
          <div className="lg-gameover">
            <h1 className="lg-gameover-heading">GAME OVER</h1>
          </div>
          {leaderboard.length > 0 && (
            <section className="lg-section">
              <p className="lg-section-title">FINAL LEADERBOARD</p>
              <div className="lg-leaderboard">
                {leaderboard.map(entry => (
                  <div
                    key={entry.teamId}
                    className={`lg-lb-row${entry.teamId === teamId ? ' lg-lb-row--mine' : ''}`}
                  >
                    <span className="lg-lb-rank">
                      {entry.rank === 1 ? '🏆' : `#${entry.rank}`}
                    </span>
                    <span className="lg-lb-name">{entry.teamName}</span>
                    <span className="lg-lb-score">{entry.score}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <p className="lg-thanks">Thanks for playing!</p>
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
