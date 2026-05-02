import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  serverTimestamp,
} from 'firebase/firestore'
import { ref, onValue } from 'firebase/database'
import { auth, firestore, db } from '../lib/firebase'

// ─── Error ────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

function mapAuthError(err) {
  const code = err?.code ?? ''
  if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return new ApiError('INVALID_CREDENTIALS', 'Incorrect username or password.')
  }
  if (code === 'auth/email-already-in-use') {
    return new ApiError('USERNAME_TAKEN', 'That username is already taken.')
  }
  if (code === 'auth/weak-password') {
    return new ApiError('WEAK_PASSWORD', 'Password is too weak. Choose a stronger one.')
  }
  return new ApiError('AUTH_ERROR', err.message ?? 'Authentication failed.')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireUser() {
  const user = auth.currentUser
  if (!user) throw new ApiError('UNAUTHENTICATED', 'You are not logged in.')
  return user
}

async function getUserDoc(uid) {
  const snap = await getDoc(doc(firestore, 'users', uid))
  return snap.exists() ? snap.data() : {}
}

function buildPlayer(uid, userData) {
  return {
    id: uid,
    email: userData.email ?? null,
    display_name: userData.displayName ?? '',
    username: userData.username ?? '',
    first_name: userData.firstName ?? '',
    last_name: userData.lastName ?? '',
  }
}

async function getTeamId(uid) {
  const userData = await getUserDoc(uid)
  return userData.teamId ?? null
}

function tsToIso(val) {
  if (!val) return null
  if (typeof val === 'string') return val
  if (val?.toDate) return val.toDate().toISOString()
  return val
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login({ username, password }) {
  // Look up the user's stored auth-email by their username
  const q = query(
    collection(firestore, 'users'),
    where('username', '==', username),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) {
    throw new ApiError('INVALID_CREDENTIALS', 'Incorrect username or password.')
  }
  const userDoc = snap.docs[0]
  const userData = userDoc.data()
  const authEmail = userData.authEmail ?? userData.email

  if (!authEmail) {
    throw new ApiError('INVALID_CREDENTIALS', 'Incorrect username or password.')
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, authEmail, password)
    return {
      player: buildPlayer(cred.user.uid, userData),
      player_session_token: cred.user.uid,
    }
  } catch (err) {
    throw mapAuthError(err)
  }
}

export async function register({ first_name, last_name, username, password }) {
  // Synthetic internal email so Firebase auth is email-based
  const authEmail = `${username.toLowerCase()}@players.pulseiq.app`

  let cred
  try {
    cred = await createUserWithEmailAndPassword(auth, authEmail, password)
  } catch (err) {
    throw mapAuthError(err)
  }

  const uid = cred.user.uid
  const displayName = `${first_name} ${last_name}`.trim()

  await setDoc(doc(firestore, 'users', uid), {
    authEmail,
    email: null,
    displayName,
    username,
    firstName: first_name,
    lastName: last_name,
    role: 'player',
    createdAt: serverTimestamp(),
  })

  return {
    player: {
      id: uid,
      email: null,
      display_name: displayName,
      username,
      first_name,
      last_name,
    },
    player_session_token: uid,
  }
}

export async function me() {
  const user = requireUser()
  const userData = await getUserDoc(user.uid)
  return { player: buildPlayer(user.uid, userData) }
}

export async function logout() {
  await signOut(auth)
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function dashboard() {
  const user = requireUser()
  const userData = await getUserDoc(user.uid)
  const player = buildPlayer(user.uid, userData)
  const teamId = userData.teamId ?? null

  // Upcoming sessions
  const sessSnap = await getDocs(
    query(collection(firestore, 'sessions'), where('status', 'in', ['open', 'scheduled', 'live'])),
  )

  let team = null
  let membership = null
  let pending_join_requests = []
  let leaderboard_summary = null
  const upcoming_games = []

  if (teamId) {
    const [teamSnap, myMemberSnap] = await Promise.all([
      getDoc(doc(firestore, 'teams', teamId)),
      getDocs(query(collection(firestore, 'teams', teamId, 'members'), where('userId', '==', user.uid))),
    ])

    const teamData = teamSnap.data() ?? {}
    const myMemberData = myMemberSnap.docs[0]?.data() ?? {}
    const isCaptain = teamData.captainId === user.uid

    team = { id: teamId, name: teamData.name, member_count: teamData.memberCount ?? 0 }
    membership = {
      player_id: user.uid,
      team_id: teamId,
      is_captain: isCaptain,
      is_scribe: myMemberData.role === 'scribe' || myMemberData.role === 'captain',
    }

    // Registration status per session
    for (const sessDoc of sessSnap.docs) {
      const sessData = sessDoc.data()
      const regSnap = await getDoc(doc(firestore, 'sessions', sessDoc.id, 'registrations', teamId))
      const regData = regSnap.exists() ? regSnap.data() : null
      upcoming_games.push({
        id: sessDoc.id,
        canonical_session_id: sessDoc.id,
        title: sessData.title,
        venue: sessData.venue,
        starts_at: tsToIso(sessData.startsAt),
        status: sessData.status,
        registration_status: regData
          ? (regData.attendanceStatus === 'confirmed' ? 'confirmed'
            : regData.attendanceStatus === 'attendance_requested' ? 'attendance_requested'
            : 'registered')
          : 'not_registered',
        team_name: regData ? team.name : null,
      })
    }

    // Pending join requests for captain
    if (isCaptain) {
      const reqSnap = await getDocs(
        query(collection(firestore, 'teams', teamId, 'members'), where('status', '==', 'pending')),
      )
      reqSnap.forEach(d => {
        const rd = d.data()
        pending_join_requests.push({
          id: d.id,
          player_id: rd.userId,
          player_name: rd.displayName,
          player_username: rd.username,
          status: 'pending',
        })
      })
    }

    // Season leaderboard summary
    try {
      const seasonSnap = await getDocs(
        query(collection(firestore, 'seasons'), where('status', '==', 'active'), limit(1)),
      )
      if (!seasonSnap.empty) {
        const seasonId = seasonSnap.docs[0].id
        const lbSnap = await getDoc(doc(firestore, 'seasons', seasonId, 'leaderboard', teamId))
        if (lbSnap.exists()) {
          leaderboard_summary = {
            team_current_season_rank: lbSnap.data().rank ?? null,
            team_all_time_rank: null,
          }
        }
      }
    } catch { /* non-critical */ }
  } else {
    // No team — just list sessions without registration status
    sessSnap.forEach(d => {
      const data = d.data()
      upcoming_games.push({
        id: d.id,
        canonical_session_id: d.id,
        title: data.title,
        venue: data.venue,
        starts_at: tsToIso(data.startsAt),
        status: data.status,
        registration_status: 'not_registered',
        team_name: null,
      })
    })
  }

  return {
    player,
    team,
    membership,
    upcoming_games,
    registered_games: upcoming_games.filter(g => g.registration_status !== 'not_registered'),
    pending_join_requests,
    leaderboard_summary,
  }
}

// ─── Team ─────────────────────────────────────────────────────────────────────

export async function getTeam() {
  const user = requireUser()
  const teamId = await getTeamId(user.uid)

  if (!teamId) return { team: null, membership: null, members: [] }

  const [teamSnap, membersSnap] = await Promise.all([
    getDoc(doc(firestore, 'teams', teamId)),
    getDocs(query(collection(firestore, 'teams', teamId, 'members'), where('status', '==', 'member'))),
  ])

  const teamData = teamSnap.data() ?? {}
  const isCaptain = teamData.captainId === user.uid
  let myRole = 'member'

  const members = membersSnap.docs.map(d => {
    const m = d.data()
    const isMe = m.userId === user.uid
    if (isMe) myRole = m.role ?? 'member'
    return {
      player_id: m.userId,
      player_name: m.displayName,
      username: m.username,
      is_captain: teamData.captainId === m.userId,
      is_scribe: m.role === 'scribe' || m.role === 'captain',
      status: 'active',
    }
  })

  return {
    team: {
      id: teamId,
      name: teamData.name,
      member_count: members.length,
    },
    membership: {
      player_id: user.uid,
      team_id: teamId,
      is_captain: isCaptain,
      is_scribe: myRole === 'scribe' || myRole === 'captain',
      status: 'active',
    },
    members,
  }
}

export async function createTeam(teamName) {
  const user = requireUser()
  const userData = await getUserDoc(user.uid)

  const teamRef = doc(collection(firestore, 'teams'))
  const teamId = teamRef.id
  const memberRef = doc(collection(firestore, 'teams', teamId, 'members'))

  await Promise.all([
    setDoc(teamRef, {
      name: teamName,
      nameLower: teamName.toLowerCase(),
      captainId: user.uid,
      createdAt: serverTimestamp(),
      memberCount: 1,
    }),
    setDoc(memberRef, {
      userId: user.uid,
      status: 'member',
      role: 'captain',
      displayName: userData.displayName ?? '',
      username: userData.username ?? '',
      joinedAt: serverTimestamp(),
    }),
    updateDoc(doc(firestore, 'users', user.uid), { teamId }),
  ])

  const team = { id: teamId, name: teamName }
  const membership = { player_id: user.uid, team_id: teamId, is_captain: true, is_scribe: true }
  return { team, membership }
}

export async function searchTeams(queryStr) {
  const q = queryStr.toLowerCase()
  const snap = await getDocs(
    query(
      collection(firestore, 'teams'),
      where('nameLower', '>=', q),
      where('nameLower', '<=', q + ''),
      limit(20),
    ),
  )

  const teams = await Promise.all(
    snap.docs.map(async d => {
      const data = d.data()
      // Get captain's display name
      let captainName = ''
      try {
        if (data.captainId) {
          const captainDoc = await getDoc(doc(firestore, 'users', data.captainId))
          captainName = captainDoc.data()?.displayName ?? ''
        }
      } catch { /* non-critical */ }

      // Count active members
      const membersSnap = await getDocs(
        query(collection(firestore, 'teams', d.id, 'members'), where('status', '==', 'member')),
      )

      return {
        id: d.id,
        name: data.name,
        member_count: membersSnap.size,
        captain_name: captainName,
      }
    }),
  )

  return { teams }
}

export async function requestToJoin(teamId) {
  const user = requireUser()
  const userData = await getUserDoc(user.uid)
  const memberRef = doc(collection(firestore, 'teams', teamId, 'members'))

  await setDoc(memberRef, {
    userId: user.uid,
    status: 'pending',
    role: 'member',
    displayName: userData.displayName ?? '',
    username: userData.username ?? '',
    requestedAt: serverTimestamp(),
  })

  return { request: { id: memberRef.id, team_id: teamId, status: 'pending' } }
}

export async function getJoinRequests(teamId) {
  const snap = await getDocs(
    query(collection(firestore, 'teams', teamId, 'members'), where('status', '==', 'pending')),
  )

  const requests = snap.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      team_id: teamId,
      player_id: data.userId,
      player_name: data.displayName,
      player_username: data.username,
      status: 'pending',
    }
  })

  return { requests }
}

export async function handleJoinRequest(memberId, action) {
  // Derive the captain's team from their auth state
  const user = requireUser()
  const teamId = await getTeamId(user.uid)
  if (!teamId) throw new ApiError('NOT_FOUND', 'You are not on a team.')

  const memberRef = doc(firestore, 'teams', teamId, 'members', memberId)
  const approved = action === 'approve' || action === 'approved'

  if (approved) {
    const memberSnap = await getDoc(memberRef)
    const memberData = memberSnap.data() ?? {}
    await Promise.all([
      updateDoc(memberRef, { status: 'member', role: 'member', joinedAt: serverTimestamp() }),
      memberData.userId
        ? updateDoc(doc(firestore, 'users', memberData.userId), { teamId })
        : Promise.resolve(),
    ])
  } else {
    await deleteDoc(memberRef)
  }

  // Return updated members list
  const membersSnap = await getDocs(
    query(collection(firestore, 'teams', teamId, 'members'), where('status', '==', 'member')),
  )
  const teamSnap = await getDoc(doc(firestore, 'teams', teamId))
  const captainId = teamSnap.data()?.captainId

  const members = membersSnap.docs.map(d => {
    const m = d.data()
    return {
      player_id: m.userId,
      player_name: m.displayName,
      username: m.username,
      is_captain: m.userId === captainId,
      is_scribe: m.role === 'scribe' || m.role === 'captain',
      status: 'active',
    }
  })

  return { request: { id: memberId, status: action }, members }
}

export async function leaveTeam(teamId) {
  const user = requireUser()

  // Find and delete the user's member doc
  const membersSnap = await getDocs(
    query(collection(firestore, 'teams', teamId, 'members'), where('userId', '==', user.uid)),
  )
  await Promise.all([
    ...membersSnap.docs.map(d => deleteDoc(d.ref)),
    updateDoc(doc(firestore, 'users', user.uid), { teamId: null }),
  ])

  return { team: null, membership: null, members: [] }
}

// ─── Games ────────────────────────────────────────────────────────────────────

export async function getGames() {
  const user = requireUser()
  const teamId = await getTeamId(user.uid)

  const sessSnap = await getDocs(
    query(collection(firestore, 'sessions'), where('status', 'in', ['open', 'scheduled', 'live'])),
  )

  const games = await Promise.all(
    sessSnap.docs.map(async d => {
      const data = d.data()
      let registrationStatus = 'not_registered'
      let teamName = null

      if (teamId) {
        const regSnap = await getDoc(doc(firestore, 'sessions', d.id, 'registrations', teamId))
        if (regSnap.exists()) {
          const reg = regSnap.data()
          registrationStatus =
            reg.attendanceStatus === 'confirmed' ? 'confirmed'
            : reg.attendanceStatus === 'attendance_requested' ? 'attendance_requested'
            : 'registered'
          teamName = reg.teamName ?? null
        }
      }

      return {
        id: d.id,
        canonical_session_id: d.id,
        game_id: d.id,
        title: data.title,
        venue: data.venue,
        starts_at: tsToIso(data.startsAt),
        status: data.status,
        registration_status: registrationStatus,
        team_id: teamId,
        team_name: teamName,
      }
    }),
  )

  return { games }
}

export async function getGameDetails(sessionId) {
  const user = requireUser()

  const sessionSnap = await getDoc(doc(firestore, 'sessions', sessionId))
  if (!sessionSnap.exists()) throw new ApiError('NOT_FOUND', 'Game not found.')
  const sessionData = sessionSnap.data()

  const teamId = await getTeamId(user.uid)
  let teamObj = null
  let membership = null
  let registration = null
  let canRegister = false
  let canConfirmAttendance = false
  let isCaptain = false

  if (teamId) {
    const [teamSnap, myMemberSnap] = await Promise.all([
      getDoc(doc(firestore, 'teams', teamId)),
      getDocs(query(collection(firestore, 'teams', teamId, 'members'), where('userId', '==', user.uid))),
    ])

    const teamData = teamSnap.data() ?? {}
    const myMemberData = myMemberSnap.docs[0]?.data() ?? {}
    isCaptain = teamData.captainId === user.uid

    teamObj = { id: teamId, name: teamData.name }
    membership = {
      is_captain: isCaptain,
      is_scribe: myMemberData.role === 'scribe' || myMemberData.role === 'captain',
    }

    const regSnap = await getDoc(doc(firestore, 'sessions', sessionId, 'registrations', teamId))
    if (regSnap.exists()) {
      const reg = regSnap.data()
      registration = {
        id: regSnap.id,
        session_id: sessionId,
        game_id: sessionId,
        team_id: teamId,
        team_name: teamData.name,
        expected_team_size: reg.teamSize ?? null,
        confirmed_team_size: reg.confirmedTeamSize ?? null,
        attendance_status: reg.attendanceStatus ?? 'not_requested',
        status: 'registered',
      }
      canConfirmAttendance =
        reg.attendanceStatus === 'attendance_requested' &&
        sessionData.status !== 'completed'
    } else {
      canRegister = sessionData.status === 'open' || sessionData.status === 'scheduled'
    }
  }

  return {
    game: {
      title: sessionData.title,
      venue: sessionData.venue,
      starts_at: tsToIso(sessionData.startsAt),
      game_id: sessionId,
      status: sessionData.status,
      game_state: sessionData.status === 'live' ? 'live' : null,
    },
    team: teamObj,
    membership,
    registration,
    can_register: canRegister,
    can_confirm_attendance: canConfirmAttendance,
    is_captain: isCaptain,
  }
}

export async function registerForGame(sessionId, teamSize) {
  const user = requireUser()
  const teamId = await getTeamId(user.uid)
  if (!teamId) throw new ApiError('NO_TEAM', 'You are not on a team.')

  const teamSnap = await getDoc(doc(firestore, 'teams', teamId))
  const teamName = teamSnap.data()?.name ?? ''

  await setDoc(doc(firestore, 'sessions', sessionId, 'registrations', teamId), {
    teamId,
    teamName,
    teamSize,
    attendanceStatus: 'not_requested',
    registeredAt: serverTimestamp(),
  })

  return {
    registration: {
      id: teamId,
      session_id: sessionId,
      game_id: sessionId,
      team_id: teamId,
      team_name: teamName,
      expected_team_size: teamSize,
      confirmed_team_size: null,
      attendance_status: 'not_requested',
      status: 'registered',
    },
  }
}

export async function confirmAttendance(sessionId, confirmedTeamSize) {
  const user = requireUser()
  const teamId = await getTeamId(user.uid)
  if (!teamId) throw new ApiError('NO_TEAM', 'You are not on a team.')

  await updateDoc(doc(firestore, 'sessions', sessionId, 'registrations', teamId), {
    attendanceStatus: 'confirmed',
    confirmedTeamSize,
  })

  return {
    registration: {
      attendance_status: 'confirmed',
      confirmed_team_size: confirmedTeamSize,
    },
  }
}

// ─── Live game ────────────────────────────────────────────────────────────────

// Subscribes to RTDB /liveSessions/{sessionId} and calls onData with each update.
// Returns an unsubscribe function.
export function getPaperLiveState(sessionId, onData) {
  const liveRef = ref(db, `liveSessions/${sessionId}`)
  return onValue(
    liveRef,
    snap => onData(snap.val()),
    err => { if (import.meta.env.DEV) console.warn('[liveSessions] error:', err.message) },
  )
}

// ─── Leaderboards ─────────────────────────────────────────────────────────────

export async function getLeaderboards() {
  const seasonSnap = await getDocs(
    query(collection(firestore, 'seasons'), where('status', '==', 'active'), limit(1)),
  )

  if (seasonSnap.empty) {
    return { current_season: null, current_season_leaderboard: [], all_time_leaderboard: [] }
  }

  const seasonDoc = seasonSnap.docs[0]
  const current_season = { id: seasonDoc.id, name: seasonDoc.data().name, is_active: true }

  const lbSnap = await getDocs(collection(firestore, 'seasons', seasonDoc.id, 'leaderboard'))
  const current_season_leaderboard = lbSnap.docs
    .map(d => {
      const data = d.data()
      return {
        team_id: d.id,
        team_name: data.teamName,
        total_points: data.totalPoints ?? 0,
        games_played: data.gamesPlayed ?? 0,
        rank: data.rank ?? 0,
      }
    })
    .sort((a, b) => a.rank - b.rank)

  let all_time_leaderboard = []
  try {
    const atSnap = await getDocs(collection(firestore, 'leaderboard'))
    all_time_leaderboard = atSnap.docs
      .map(d => {
        const data = d.data()
        return {
          team_id: d.id,
          team_name: data.teamName,
          total_points: data.totalPoints ?? 0,
          games_played: data.gamesPlayed ?? 0,
          rank: data.rank ?? 0,
        }
      })
      .sort((a, b) => a.rank - b.rank)
  } catch { /* no all-time collection yet */ }

  return { current_season, current_season_leaderboard, all_time_leaderboard }
}
