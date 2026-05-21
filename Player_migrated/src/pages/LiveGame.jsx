import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ref, set, serverTimestamp as rtdbServerTimestamp } from 'firebase/database'
import { db } from '../lib/firebase'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { firestore } from '../lib/firebase'
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
    await set(tapRef, { teamId, teamName, tappedAt: rtdbServerTimestamp() })
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
    const answerRef = ref(db, `pulseSessions/${pulseSessionId}/currentGame/answers/${teamId}`)
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
          <p className="pulse-question-text">{q.question ?? q.text}</p>
          <div className="pulse-blitz-choices">
            <div className="pulse-blitz-choice">
              <span className="pulse-blitz-choice-label">A</span>
              <span className="pulse-blitz-choice-text">{q.choiceA ?? q.choices?.[0]}</span>
            </div>
            <div className="pulse-blitz-choice">
              <span className="pulse-blitz-choice-label">B</span>
              <span className="pulse-blitz-choice-text">{q.choiceB ?? q.choices?.[1]}</span>
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

function PulseMeterBar({ score, maxScore = 4, teamName }) {
  if (score == null) return null
  const pct = Math.min(100, (score / maxScore) * 100)
  const isEmpty = score === 0
  const isFull = score >= maxScore

  return (
    <div className="pulse-meter-bar-wrap">
      <style>{`
        @keyframes electric {
          0%   { background-position: 0% 50%; opacity: 0.9; }
          50%  { background-position: 100% 50%; opacity: 1; }
          100% { background-position: 0% 50%; opacity: 0.9; }
        }
        @keyframes electric-flicker {
          0%, 100% { opacity: 1; }
          10%       { opacity: 0.7; }
          12%       { opacity: 1; }
          50%       { opacity: 0.85; }
          52%       { opacity: 1; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(249,115,22,0.6), 0 0 20px rgba(249,115,22,0.3); }
          50%       { box-shadow: 0 0 16px rgba(249,115,22,0.9), 0 0 40px rgba(249,115,22,0.5); }
        }
      `}</style>
      <div className="pulse-meter-bar-inner">
        <span className="pulse-meter-bar-label">⚡ PULSE</span>
        <div className="pulse-meter-bar-track">
          {!isEmpty && (
            <div
              className="pulse-meter-bar-fill"
              style={{
                width: `${pct}%`,
                background: isFull
                  ? 'linear-gradient(90deg, #f97316, #fbbf24, #f97316, #fb923c, #f97316)'
                  : 'linear-gradient(90deg, #c2410c, #f97316, #fb923c, #f97316)',
                backgroundSize: '200% 100%',
                animation: isFull
                  ? 'electric 0.8s ease-in-out infinite, electric-flicker 1.2s ease-in-out infinite, pulse-glow 1s ease-in-out infinite'
                  : 'electric 1.4s ease-in-out infinite',
                borderRadius: 6,
                height: '100%',
                transition: 'width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            />
          )}
          {/* Segment dividers */}
          {Array.from({ length: maxScore - 1 }).map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${((i + 1) / maxScore) * 100}%`,
                top: 0, bottom: 0,
                width: 2,
                background: 'rgba(0,0,0,0.4)',
                zIndex: 2,
              }}
            />
          ))}
        </div>
        <span className="pulse-meter-bar-score">{score}/{maxScore}</span>
      </div>
    </div>
  )
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

  const [pulseTeamScore, setPulseTeamScore] = useState(null)
  const [raffleEntered, setRaffleEntered] = useState(false)
  const [raffleLoading, setRaffleLoading] = useState(false)
  const [raffleError, setRaffleError] = useState('')

  useEffect(() => {
    if (!gameId || !pulseTeamId) return
    const docRef = doc(firestore, 'sessions', gameId, 'pulseMeter', pulseTeamId)
    const unsub = onSnapshot(docRef, (snap) => {
      setPulseTeamScore(snap.exists() ? (snap.data().score ?? 0) : null)
    })
    return () => unsub()
  }, [gameId, pulseTeamId])

  useEffect(() => {
    if (!gameId || !pulseTeamId) return
    getDoc(doc(firestore, 'sessions', gameId, 'raffleEntries', pulseTeamId))
      .then(snap => setRaffleEntered(snap.exists()))
      .catch(() => {})
  }, [gameId, pulseTeamId])

  const handleRaffleEnter = async () => {
    if (raffleEntered || raffleLoading) return
    setRaffleLoading(true)
    setRaffleError('')
    try {
      await setDoc(
        doc(firestore, 'sessions', gameId, 'raffleEntries', pulseTeamId),
        {
          teamId: pulseTeamId,
          teamName: detail?.team?.name ?? 'Unknown Team',
          enteredAt: serverTimestamp(),
        }
      )
      setRaffleEntered(true)
    } catch (e) {
      console.error(e)
      setRaffleError('Failed to enter raffle. Please try again.')
    } finally {
      setRaffleLoading(false)
    }
  }

  const { sessionData: pulseSession, sessionId: pulseSessionId } = usePulseSession(pulseTeamId, gameId)
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
  const teamScore = leaderboardRaw?.[pulseTeamId]
  const roundScores = teamScore?.roundScores
    ?? d?.roundScores
    ?? d?.round_scores
    ?? []

  const isLobby = !liveState || liveState === 'lobby'

  const showPulseBar = pulseTeamScore !== null

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
            {d?.game?.venue && <p className="lg-game-venue">{d?.game?.venue}</p>}
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
            {d?.game?.venue && <p className="lg-game-venue">{d?.game?.venue}</p>}
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

  // ── ROUND RESULTS ────────────────────────────────────────────────
  if (d?.status === 'round_results' || liveState === 'round_results') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', padding: '2rem',
        textAlign: 'center', gap: '1.5rem',
      }}>
        <p style={{ fontSize: '2.5rem' }}>✅</p>
        <h2 style={{
          color: '#fff', fontWeight: 800,
          fontSize: 'clamp(1.2rem, 5vw, 1.8rem)',
          margin: 0,
        }}>
          Round Complete!
        </h2>
        {roundScores.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 12, padding: '1rem 1.5rem',
            width: '100%', maxWidth: 320,
          }}>
            {roundScores.map((pts, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '0.4rem 0',
                borderBottom: i < roundScores.length - 1
                  ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <span style={{ color: '#888', fontSize: '0.9rem' }}>
                  Round {i + 1}
                </span>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
                  {pts} pts
                </span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '0.6rem 0 0',
              marginTop: '0.4rem',
              borderTop: '1px solid rgba(249,115,22,0.3)',
            }}>
              <span style={{ color: '#f97316', fontWeight: 700 }}>Total</span>
              <span style={{ color: '#f97316', fontWeight: 800 }}>
                {roundScores.reduce((a, b) => a + b, 0)} pts
              </span>
            </div>
          </div>
        )}
        <p style={{ color: '#555', fontSize: '0.85rem', margin: 0 }}>
          Waiting for the next round...
        </p>
      </div>
    )
  }

  // ── GAME COMPLETE (unhandled state fallback) ──────────────────────
  if (d?.status === 'game_complete' || liveState === 'game_complete') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
        <p>Waiting for the next round...</p>
      </div>
    )
  }

  // ── WAITING (unhandled state fallback) ────────────────────────────
  if (d?.status === 'waiting' || liveState === 'waiting') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
        <p>Waiting for the next round...</p>
      </div>
    )
  }

  // ── No RTDB data yet (timeout fired before first snapshot) ──────
  if (!d) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
        <p style={{ fontSize: '1rem' }}>
          Waiting for the game to start...
        </p>
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
          <p className="lg-game-title">{d?.game?.title}</p>
          <p className="lg-game-venue">{d?.game?.venue}</p>
        </div>
        <GameStateBadge status={gameStatus} />
      </header>

      {showPulseBar && <PulseMeterBar score={pulseTeamScore} />}

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

      {/* ── Raffle sign-up ── */}
      {!isPulseActive && !isLobby && (
        <div style={{
          margin: '1rem 0',
          padding: '1rem',
          background: raffleEntered
            ? 'rgba(34,197,94,0.08)'
            : 'rgba(249,115,22,0.08)',
          border: `1px solid ${raffleEntered
            ? 'rgba(34,197,94,0.25)'
            : 'rgba(249,115,22,0.25)'}`,
          borderRadius: 12,
          textAlign: 'center',
        }}>
          {raffleEntered ? (
            <p style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>
              🎟️ You're entered in the raffle!
            </p>
          ) : (
            <>
              <p style={{ color: '#f97316', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                🎟️ Tonight's Raffle
              </p>
              <button
                onClick={handleRaffleEnter}
                disabled={raffleLoading}
                style={{
                  background: '#f97316', color: '#000',
                  border: 'none', borderRadius: 8,
                  padding: '0.625rem 1.5rem',
                  fontWeight: 800, fontSize: '0.875rem',
                  cursor: raffleLoading ? 'not-allowed' : 'pointer',
                  opacity: raffleLoading ? 0.6 : 1,
                }}
              >
                {raffleLoading ? 'Entering...' : 'Enter Raffle'}
              </button>
              {raffleError && (
                <p style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem', margin: '0.5rem 0 0' }}>
                  {raffleError}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Team score breakdown — all states except lobby ── */}
      {!isPulseActive && !isLobby && (() => {
        const rs = d?.round_scores ?? []
        if (!rs.length) return null
        const total = rs.reduce((a, b) => a + (b.score ?? 0), 0)
        return (
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 12, overflow: 'hidden',
            marginTop: '1rem',
          }}>
            <p style={{
              fontSize: '0.7rem', fontWeight: 700,
              color: '#888', letterSpacing: '0.15em',
              textTransform: 'uppercase', padding: '0.75rem 1rem 0.5rem',
              margin: 0,
            }}>
              Team Score
            </p>
            {rs.map((row, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '0.4rem 1rem',
                borderTop: '1px solid rgba(255,255,255,0.05)',
              }}>
                <span style={{ color: '#888', fontSize: '0.85rem' }}>
                  {row.round_name ?? `Round ${row.round_number ?? i + 1}`}
                </span>
                <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>
                  {row.score} pts
                </span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '0.6rem 1rem',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(249,115,22,0.08)',
            }}>
              <span style={{ color: '#f97316', fontSize: '0.9rem', fontWeight: 700 }}>
                Total
              </span>
              <span style={{ color: '#f97316', fontSize: '0.9rem', fontWeight: 800 }}>
                {total} pts
              </span>
            </div>
          </div>
        )
      })()}

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
        <p className="lg-results-sub">Next round starting soon...</p>
      )}

      {/* ── ROUND RESULTS REVEALED ── */}
      {!isPulseActive && liveState === 'round_results_revealed' && (
        <p className="lg-results-sub">Next round starting soon...</p>
      )}

      {/* ── LEADERBOARD ── */}
      {!isPulseActive && liveState === 'leaderboard' && (
        <div className="lg-info-card">
          Check the big screen for the leaderboard!
        </div>
      )}

      {/* ── FINISHED ── */}
      {!isPulseActive && liveState === 'finished' && (
        <>
          <div className="lg-gameover">
            <h1 className="lg-gameover-heading">GAME OVER</h1>
          </div>
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
