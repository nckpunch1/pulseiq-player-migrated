import {
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  limit,
  serverTimestamp,
} from 'firebase/firestore'
import { ref, onValue } from 'firebase/database'
import { auth, firestore, db } from '../lib/firebase'
import { cached, cacheKey, TTL_MS, invalidate, clear as clearCache } from './cache'

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
    return new ApiError('EMAIL_TAKEN', 'An account with this email already exists.')
  }
  if (code === 'auth/invalid-email') {
    return new ApiError('INVALID_EMAIL', 'Please enter a valid email address.')
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

async function resolveTeamId(uid) {
  const userData = await getUserDoc(uid)
  return userData.teamId ?? null
}

export async function getTeamId() {
  const user = requireUser()
  return resolveTeamId(user.uid)
}

function tsToIso(val) {
  if (!val) return null
  if (typeof val === 'string') return val
  if (val?.toDate) return val.toDate().toISOString()
  return val
}

function mapAttendanceStatus(attendanceStatus) {
  if (attendanceStatus === 'checked_in') return 'checked_in'
  if (attendanceStatus === 'no_show') return 'no_show'
  if (attendanceStatus === 'confirmed' || attendanceStatus === 'attending' || attendanceStatus === 'present') return 'confirmed'
  if (attendanceStatus === 'confirmation_requested' || attendanceStatus === 'attendance_requested') return 'confirmation_requested'
  return 'registered'
}

async function getVenueName(venueId) {
  if (!venueId) return ''
  try {
    const snap = await getDoc(doc(firestore, 'venues', venueId))
    return snap.exists() ? (snap.data().name ?? '') : ''
  } catch {
    return ''
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login({ email, password }) {
  const normalizedEmail = email.toLowerCase().trim()
  try {
    const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password)
    const userData = await getUserDoc(cred.user.uid)

    const isVerified = cred.user.emailVerified || userData.manuallyVerified === true

    if (!isVerified) {
      return {
        player: buildPlayer(cred.user.uid, userData),
        player_session_token: cred.user.uid,
        requiresVerification: true,
      }
    }

    // Sync emailVerified to Firestore if Firebase confirms it
    if (cred.user.emailVerified && !userData.emailVerified) {
      await updateDoc(doc(firestore, 'users', cred.user.uid), { emailVerified: true })
    }

    return {
      player: buildPlayer(cred.user.uid, userData),
      player_session_token: cred.user.uid,
    }
  } catch (err) {
    throw mapAuthError(err)
  }
}

export async function register({ first_name, last_name, email, password }) {
  const normalizedEmail = email.toLowerCase().trim()

  try {
    const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password)
    const uid = cred.user.uid
    const displayName = `${first_name} ${last_name}`.trim()

    await setDoc(doc(firestore, 'users', uid), {
      email: normalizedEmail,
      authEmail: normalizedEmail,
      displayName,
      firstName: first_name,
      lastName: last_name,
      username: normalizedEmail,
      role: 'player',
      teamId: null,
      emailVerified: false,
      manuallyVerified: false,
      createdAt: serverTimestamp(),
    })

    await sendEmailVerification(cred.user)

    return {
      player: {
        id: uid,
        email: normalizedEmail,
        display_name: displayName,
        first_name,
        last_name,
        emailVerified: false,
      },
      player_session_token: uid,
      requiresVerification: true,
    }
  } catch (err) {
    throw mapAuthError(err)
  }
}

export async function me() {
  const user = requireUser()
  const userData = await getUserDoc(user.uid)
  return { player: buildPlayer(user.uid, userData) }
}

export async function logout() {
  await signOut(auth)
  // Hygiene on a shared device: drop this account's cached reads from memory.
  clearCache()
}

export async function resendVerificationEmail() {
  const user = auth.currentUser
  if (!user) throw new ApiError('UNAUTHENTICATED', 'Not logged in.')
  await sendEmailVerification(user)
}

export async function resetPassword(email) {
  const normalizedEmail = email.toLowerCase().trim()
  try {
    await sendPasswordResetEmail(auth, normalizedEmail)
  } catch (err) {
    throw mapAuthError(err)
  }
}

// ─── Cache invalidation ───────────────────────────────────────────────────────

/**
 * Drop the cached reads that depend on the caller's team and registration state.
 *
 * Call after any mutation that changes either. Both `dashboard` and `getGames`
 * are keyed on uid, so clearing by bare function name covers the current user
 * (and harmlessly any other uid still in the map).
 *
 * Deliberately does NOT touch getLeaderboards / getSeasonLeaderboard /
 * listRegions: those are slow-moving global data that none of these mutations
 * affect, and they are the reads the cache exists to save (~165 per mount).
 *
 * Exported because one mutation lives outside this module — Team.jsx writes
 * users/{uid}.teamId directly from its "Been approved? Tap to refresh" button.
 */
export function invalidateTeamAndGameState() {
  invalidate('dashboard')
  invalidate('getGames')
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

// Keyed on uid, not just the function name: two accounts on the same device must
// never see each other's dashboard. requireUser() runs here as well as in the
// body so an unauthenticated call still throws instead of reaching the cache.
export async function dashboard() {
  const user = requireUser()
  return cached(cacheKey('dashboard', user.uid), TTL_MS, dashboardUncached)
}

async function dashboardUncached() {
  const user = requireUser()

  // Sessions query doesn't need teamId — run it in parallel with the user doc read
  const [userData, sessSnap] = await Promise.all([
    getUserDoc(user.uid),
    getDocs(query(collection(firestore, 'sessions'), where('status', 'in', ['open', 'scheduled', 'live']))),
  ])
  const player = buildPlayer(user.uid, userData)
  const teamId = userData.teamId ?? null

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

    const sessionDocs = sessSnap.docs
    const registrationSnaps = teamId
      ? await Promise.all(
          sessionDocs.map(sessDoc =>
            getDocs(query(
              collection(firestore, 'sessions', sessDoc.id, 'registrations'),
              where('teamId', '==', teamId),
            ))
          )
        )
      : sessionDocs.map(() => ({ empty: true, docs: [] }))

    const visibleSessions = sessionDocs.filter(sessDoc => {
      const sessData = sessDoc.data()
      if (!sessData.visibility || sessData.visibility === 'public') return true
      if (sessData.visibility === 'private') {
        return registrationSnaps.some((regSnap, i) => {
          return sessionDocs[i].id === sessDoc.id && !regSnap.empty
        })
      }
      return true
    })

    for (const sessDoc of visibleSessions) {
      const origIdx = sessionDocs.findIndex(d => d.id === sessDoc.id)
      const sessData = sessDoc.data()
      const regSnap = registrationSnaps[origIdx]
      const regData = regSnap.empty ? null : regSnap.docs[0]?.data()
      upcoming_games.push({
        id: sessDoc.id,
        canonical_session_id: sessDoc.id,
        name: sessData.name ?? '',
        title: sessData.title,
        venue: sessData.venue,
        date: sessData.date ?? sessData.startsAt,
        starts_at: tsToIso(sessData.startsAt),
        status: sessData.status,
        registration_status: regData
          ? mapAttendanceStatus(regData.attendanceStatus)
          : 'not_registered',
        team_name: regData ? team?.name : null,
      })
    }

    // Join requests + active season in a single parallel batch — they're independent
    const [reqSnap, seasonSnap] = await Promise.all([
      isCaptain
        ? getDocs(query(collection(firestore, 'teams', teamId, 'members'), where('status', '==', 'pending')))
        : Promise.resolve(null),
      getDocs(query(collection(firestore, 'seasons'), where('status', '==', 'active'), limit(1))).catch(() => null),
    ])

    if (reqSnap) {
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

    // Leaderboard is sequential after the season query because it needs seasonId
    try {
      if (seasonSnap && !seasonSnap.empty) {
        const seasonId = seasonSnap.docs[0].id
        // Leaderboard docs are keyed by the composite `${teamId}_${regionId}`
        // (one entry per region the team has played in), never the bare
        // teamId — so look up by the teamId field, mirroring
        // getSeasonLeaderboard. Archived entries and null ranks (written by
        // the orphan/inactive exclusion) don't represent a standing.
        const lbSnap = await getDocs(query(
          collection(firestore, 'seasons', seasonId, 'leaderboard'),
          where('teamId', '==', teamId)
        ))
        const entries = lbSnap.docs
          .map(d => d.data())
          .filter(e => e.archived !== true && e.rank != null)
        if (entries.length > 0) {
          // Ranks are per-region sequences; a multi-region team keeps its
          // best (lowest) standing for the tile.
          const best = entries.reduce((a, b) => (b.rank < a.rank ? b : a))
          leaderboard_summary = {
            team_current_season_rank: best.rank,
            // "Global" is the placeholder for region-less play — not worth
            // labelling on the tile.
            team_current_season_region:
              best.regionName && best.regionName !== 'Global' ? best.regionName : null,
            // Not fetched: an all-time rank means aggregating every
            // leaderboard doc across every season (see getLeaderboards) —
            // too read-heavy for a dashboard tile. Follow-up feature.
            team_all_time_rank: null,
          }
        }
      }
    } catch (e) {
      // Non-critical — a failed rank read shouldn't break the dashboard —
      // but not invisible either.
      console.warn('Dashboard season rank read failed:', e)
    }
  } else {
    // No team — list only public sessions without registration status
    sessSnap.docs
      .filter(d => {
        const vis = d.data().visibility
        return !vis || vis === 'public'
      })
      .forEach(d => {
        const data = d.data()
        upcoming_games.push({
          id: d.id,
          canonical_session_id: d.id,
          name: data.name ?? '',
          title: data.title,
          venue: data.venue,
          date: data.date ?? data.startsAt,
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
  const userData = await getUserDoc(user.uid)
  const teamId = userData?.teamId ?? null
  if (!teamId) return null

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
  const displayName = userData.displayName ?? ''

  const teamRef = doc(collection(firestore, 'teams'))
  const memberRef = doc(firestore, 'teams', teamRef.id, 'members', user.uid)

  const batch = writeBatch(firestore)

  batch.set(teamRef, {
    name: teamName,
    nameLower: teamName.toLowerCase(),
    captainId: user.uid,
    captainName: displayName,
    memberCount: 1,
    createdAt: serverTimestamp(),
  })

  batch.set(memberRef, {
    userId: user.uid,
    displayName,
    username: userData.username ?? '',
    role: 'captain',
    status: 'member',
    joinedAt: serverTimestamp(),
  })

  await batch.commit()

  await updateDoc(doc(firestore, 'users', user.uid), { teamId: teamRef.id })

  // The sharp edge this invalidation exists for: without it the cached
  // team-less payload survives, and Games.jsx skips attaching its registration
  // listeners (it only attaches when teamId is set), so nothing self-corrects.
  invalidateTeamAndGameState()

  const team = { id: teamRef.id, name: teamName }
  const membership = { player_id: user.uid, team_id: teamRef.id, is_captain: true, is_scribe: true }
  return { team, membership }
}

export async function searchTeams(queryStr) {
  const q = queryStr.toLowerCase().trim()
  if (!q) return { teams: [] }

  // Range query on pre-computed nameLower — O(results) reads, not O(all teams)
  const snap = await getDocs(
    query(
      collection(firestore, 'teams'),
      where('nameLower', '>=', q),
      where('nameLower', '<=', q + ''),
      limit(20),
    )
  )

  const teams = snap.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name,
      // memberCount and captainName are denormalized on the team doc
      member_count: data.memberCount ?? 0,
      captain_name: data.captainName ?? '',
    }
  })

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

  invalidateTeamAndGameState()

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
  const teamId = await resolveTeamId(user.uid)
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
  const [membersSnap, teamSnap] = await Promise.all([
    getDocs(query(collection(firestore, 'teams', teamId, 'members'), where('status', '==', 'member'))),
    getDoc(doc(firestore, 'teams', teamId)),
  ])
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

  invalidateTeamAndGameState()

  return { team: null, membership: null, members: [] }
}

// ─── Games ────────────────────────────────────────────────────────────────────

// Keyed on uid — registration status is per-team, so this result is per-user.
export async function getGames() {
  const user = requireUser()
  return cached(cacheKey('getGames', user.uid), TTL_MS, getGamesUncached)
}

async function getGamesUncached() {
  const user = requireUser()

  // Sessions query doesn't need teamId — run it in parallel with the user doc read
  const [userData, sessSnap] = await Promise.all([
    getUserDoc(user.uid),
    getDocs(query(collection(firestore, 'sessions'), where('status', 'in', ['open', 'scheduled', 'live']))),
  ])
  const teamId = userData.teamId ?? null
  const sessionDocs = sessSnap.docs

  // Deduplicate venue IDs so a shared venue is only read once across all sessions
  const uniqueVenueIds = [...new Set(sessionDocs.map(d => d.data().venueId).filter(Boolean))]

  // All registrations + all unique venue reads in one parallel batch
  const [registrationSnaps, venueSnaps] = await Promise.all([
    teamId
      ? Promise.all(sessionDocs.map(d =>
          getDocs(query(
            collection(firestore, 'sessions', d.id, 'registrations'),
            where('teamId', '==', teamId),
            limit(1),
          ))
        ))
      : Promise.resolve(sessionDocs.map(() => ({ empty: true, docs: [] }))),
    Promise.all(uniqueVenueIds.map(id =>
      getDoc(doc(firestore, 'venues', id)).catch(() => null)
    )),
  ])

  const venueMap = new Map(
    uniqueVenueIds.map((id, i) => {
      const snap = venueSnaps[i]
      return [id, snap?.exists?.() ? (snap.data().name ?? '') : '']
    })
  )

  // Filter out private sessions the team isn't registered for
  const visiblePairs = sessionDocs
    .map((d, i) => [d, registrationSnaps[i]])
    .filter(([d, regSnap]) => {
      const vis = d.data().visibility
      if (!vis || vis === 'public') return true
      if (vis === 'private') return !regSnap.empty
      return true
    })

  const games = visiblePairs.map(([d, regSnap]) => {
    const data = d.data()
    const regData = !regSnap.empty ? regSnap.docs[0]?.data() : null
    const venueName = (data.venueId ? (venueMap.get(data.venueId) ?? '') : '') || data.venue || ''

    return {
      id: d.id,
      canonical_session_id: d.id,
      game_id: d.id,
      name: data.name ?? '',
      title: data.title,
      venue: venueName,
      date: data.date ?? data.startsAt,
      starts_at: tsToIso(data.startsAt),
      status: data.status,
      registration_status: regData ? mapAttendanceStatus(regData.attendanceStatus) : 'not_registered',
      team_id: teamId,
      team_name: regData?.teamName ?? null,
      regionId: data.regionId ?? null,
      regionName: data.regionName ?? null,
      soldOut: data.soldOut === true,
    }
  })

  return { games }
}

export async function getGameDetails(sessionId) {
  const user = requireUser()

  // Session doc and user doc (for teamId) are independent — fetch in parallel
  const [sessionSnap, teamId] = await Promise.all([
    getDoc(doc(firestore, 'sessions', sessionId)),
    resolveTeamId(user.uid),
  ])

  if (!sessionSnap.exists()) throw new ApiError('NOT_FOUND', 'Game not found.')
  const sessionData = sessionSnap.data()

  let venueName = ''
  let teamObj = null
  let membership = null
  let registration = null
  let canRegister = false
  let canConfirmAttendance = false
  let isCaptain = false

  if (teamId) {
    // Venue, team doc, member record, and registration doc are all independent — fetch in parallel
    const [resolvedVenue, teamSnap, myMemberSnap, regDocSnap] = await Promise.all([
      getVenueName(sessionData.venueId),
      getDoc(doc(firestore, 'teams', teamId)),
      getDocs(query(collection(firestore, 'teams', teamId, 'members'), where('userId', '==', user.uid))),
      getDoc(doc(firestore, 'sessions', sessionId, 'registrations', teamId)),
    ])
    venueName = resolvedVenue || sessionData.venue || ''

    const teamData = teamSnap.data() ?? {}
    const myMemberData = myMemberSnap.docs[0]?.data() ?? {}
    isCaptain = teamData.captainId === user.uid

    teamObj = { id: teamId, name: teamData.name }
    membership = {
      is_captain: isCaptain,
      is_scribe: myMemberData.role === 'scribe' || myMemberData.role === 'captain',
    }

    // Primary: direct doc lookup — teamId from user doc is the source of truth
    const regDocRef = doc(firestore, 'sessions', sessionId, 'registrations', teamId)
    let foundRegDoc = null

    if (regDocSnap.exists()) {
      foundRegDoc = regDocSnap
      // Auto-correct corrupted registration where teamId field differs from doc ID
      if (regDocSnap.data().teamId !== teamId) {
        await updateDoc(regDocRef, { teamId })
      }
    } else if (teamData.name) {
      // Fallback: locate by team name in case doc was written under a wrong ID
      const fallbackSnap = await getDocs(
        query(
          collection(firestore, 'sessions', sessionId, 'registrations'),
          where('teamName', '==', teamData.name),
          limit(1),
        ),
      )
      if (!fallbackSnap.empty) foundRegDoc = fallbackSnap.docs[0]
    }

    if (foundRegDoc) {
      const reg = foundRegDoc.data()
      registration = {
        id: foundRegDoc.id,
        session_id: sessionId,
        game_id: sessionId,
        team_id: teamId,
        team_name: teamData.name,
        expected_team_size: reg.teamSize ?? null,
        confirmed_team_size: reg.confirmedTeamSize ?? null,
        attendance_status: reg.attendanceStatus ?? 'not_requested',
        registration_status: mapAttendanceStatus(reg.attendanceStatus),
        status: 'registered',
      }
      canConfirmAttendance =
        (reg.attendanceStatus === 'confirmation_requested' || reg.attendanceStatus === 'attendance_requested') &&
        sessionData.status !== 'completed'
    } else {
      canRegister =
        sessionData.soldOut !== true &&
        (sessionData.status === 'open' || sessionData.status === 'scheduled')
    }
  } else {
    venueName = await getVenueName(sessionData.venueId) || sessionData.venue || ''
  }

  return {
    game: {
      name: sessionData.name ?? '',
      title: sessionData.title,
      venue: venueName,
      date: sessionData.date ?? sessionData.startsAt,
      starts_at: tsToIso(sessionData.startsAt),
      game_id: sessionId,
      status: sessionData.status,
      game_state: sessionData.status === 'live' ? 'live' : null,
      soldOut: sessionData.soldOut === true,
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
  const userSnap = await getDoc(doc(firestore, 'users', user.uid))
  const teamId = userSnap.exists() ? (userSnap.data().teamId ?? null) : null
  if (!teamId) throw new ApiError('NO_TEAM', 'You are not on a team.')

  // Re-read the session and reject the write if it's sold out. The UI already
  // hides Register on sold-out sessions; this guards against a stale client.
  // NOTE: this is a soft guard only — authoritative enforcement belongs in
  // firestore.rules (follow-up).
  const sessionSnap = await getDoc(doc(firestore, 'sessions', sessionId))
  if (sessionSnap.data()?.soldOut === true) {
    throw new ApiError('SOLD_OUT', 'Session is sold out.')
  }

  const teamSnap = await getDoc(doc(firestore, 'teams', teamId))
  const teamName = teamSnap.data()?.name ?? ''

  await setDoc(doc(firestore, 'sessions', sessionId, 'registrations', teamId), {
    teamId,
    teamName,
    teamSize,
    attendanceStatus: 'not_requested',
    registeredAt: serverTimestamp(),
  })

  invalidateTeamAndGameState()

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
  const teamId = await resolveTeamId(user.uid)
  if (!teamId) throw new ApiError('NO_TEAM', 'You are not on a team.')

  await updateDoc(doc(firestore, 'sessions', sessionId, 'registrations', teamId), {
    attendanceStatus: 'confirmed',
    confirmedTeamSize,
    confirmedBy: 'captain',
    confirmedAt: serverTimestamp(),
  })

  invalidateTeamAndGameState()

  return {
    registration: {
      attendance_status: 'confirmed',
      registration_status: 'confirmed',
      confirmed_team_size: confirmedTeamSize,
    },
  }
}

export async function cancelRegistration(sessionId) {
  const user = requireUser()
  const teamId = await resolveTeamId(user.uid)
  if (!teamId) throw new ApiError('NO_TEAM', 'You are not on a team.')

  await updateDoc(doc(firestore, 'sessions', sessionId, 'registrations', teamId), {
    attendanceStatus: 'cancelled',
  })

  invalidateTeamAndGameState()

  return { success: true }
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

const compareTeams = (a, b) => {
  if (b.total_points !== a.total_points) {
    return b.total_points - a.total_points
  }
  const aRounds = a.roundScores ?? {}
  const bRounds = b.roundScores ?? {}
  const maxRound = Math.max(
    ...Object.keys(aRounds).map(Number).filter(n => !isNaN(n)),
    ...Object.keys(bRounds).map(Number).filter(n => !isNaN(n)),
    0
  )
  for (let r = maxRound; r >= 1; r--) {
    const aScore = aRounds[r] ?? 0
    const bScore = bRounds[r] ?? 0
    if (bScore !== aScore) return bScore - aScore
  }
  return 0
}

// An entry is excluded from leaderboards if the team doc is missing
// (hard-deleted orphan) or the team is soft-deleted (isActive === false).
// Structural only — no name-based heuristics.
const isExcludedTeam = (teamSnap) => {
  if (!teamSnap || !teamSnap.exists()) return true
  return teamSnap.data()?.isActive === false
}

// Batch-fetch /teams docs by id, deduped. Single-doc getDoc per id (the deployed
// rules permit an authed get on any team; a collection list is not used here).
// Returns Map<teamId, DocumentSnapshot>.
const fetchTeamSnapsByIds = async (teamIds) => {
  const unique = [...new Set(teamIds.filter(Boolean))]
  const snaps = await Promise.all(
    unique.map(id => getDoc(doc(firestore, 'teams', id)))
  )
  return new Map(unique.map((id, i) => [id, snaps[i]]))
}

// The biggest single beneficiary of the cache: this path is ~165 reads per mount
// (see the unbounded collectionGroup scan below). Leaderboard data is global, so
// the key is the region only — no uid. The read-cost redesign is a separate pass;
// this only stops paying it on every navigation.
export async function getLeaderboards(regionId) {
  return cached(
    cacheKey('getLeaderboards', regionId ?? null),
    TTL_MS,
    () => getLeaderboardsUncached(regionId),
  )
}

async function getLeaderboardsUncached(regionId) {
  // Both reads are independent — fire them in parallel.
  // Each has its own .catch() so one failure doesn't suppress the other.
  // NOTE: collectionGroup('leaderboard') requires the 'leaderboard' collection group
  // to be enabled in Firestore Console (Indexes → Collection group tab) or it will
  // silently return empty results via the catch below.
  // Read cost: 1 (seasons) + N_seasons × N_teams (all leaderboard docs), e.g. 101 reads
  // for 5 seasons × 20 teams. No in-memory cache — re-fetched on every page mount.
  const [seasonSnap, allTimeSnap] = await Promise.all([
    getDocs(query(collection(firestore, 'seasons'), where('status', '==', 'active'))).catch(e => {
      console.error('getLeaderboards season error:', e)
      return null
    }),
    getDocs(collectionGroup(firestore, 'leaderboard')).catch(e => {
      console.error('getLeaderboards all-time error:', e)
      return null
    }),
  ])

  let current_season = null
  if (seasonSnap && !seasonSnap.empty) {
    current_season = { id: seasonSnap.docs[0].id, ...seasonSnap.docs[0].data() }
  }

  let all_time_leaderboard = []
  if (allTimeSnap) {
    // Collect non-archived, region-matched rows with the bare teamId extracted,
    // then join to /teams and drop orphaned/inactive teams before aggregating —
    // otherwise a hard-deleted team's cached points still count.
    const rows = []
    for (const d of allTimeSnap.docs) {
      const data = d.data()
      if (data.archived) continue

      const entryRegion = data.regionId ?? 'global'
      if (regionId && entryRegion !== regionId) continue
      // Try data field first, fall back to extracting
      // from doc ID (old format: just teamId,
      // new format: teamId_regionId)
      const docId = d.id
      const teamId = data.teamId
        ?? data.team_id
        ?? (docId.includes('_')
            ? docId.split('_')[0]
            : docId)

      if (!teamId) continue
      rows.push({ teamId, data })
    }

    // Dedupe happens inside fetchTeamSnapsByIds — a teamId can recur across seasons/regions.
    const teamSnaps = await fetchTeamSnapsByIds(rows.map(r => r.teamId))

    const teamTotals = {}
    for (const { teamId, data } of rows) {
      if (isExcludedTeam(teamSnaps.get(teamId))) continue
      if (!teamTotals[teamId]) {
        teamTotals[teamId] = {
          team_id: teamId,
          team_name: data.teamName ?? data.team_name ?? 'Unknown',
          total_points: 0,
          games_played: 0,
        }
      }
      teamTotals[teamId].total_points += data.totalPoints ?? data.total_points ?? 0
      teamTotals[teamId].games_played += data.gamesPlayed ?? data.games_played ?? 0
    }
    all_time_leaderboard = Object.values(teamTotals)
      .sort(compareTeams)
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }))
  }

  return {
    current_season,
    current_season_leaderboard: [],
    all_time_leaderboard,
  }
}

// Global and near-static, but refetched on every Leaderboard mount.
export async function listRegions() {
  return cached(cacheKey('listRegions'), TTL_MS, listRegionsUncached)
}

async function listRegionsUncached() {
  const snap = await getDocs(collection(firestore, 'regions'))
  return snap.docs.map(d => ({ id: d.id, name: d.data().name }))
}

// Global data, keyed on both args so seasons and regions can't collide.
export async function getSeasonLeaderboard(seasonId, regionId) {
  return cached(
    cacheKey('getSeasonLeaderboard', seasonId ?? null, regionId ?? null),
    TTL_MS,
    () => getSeasonLeaderboardUncached(seasonId, regionId),
  )
}

async function getSeasonLeaderboardUncached(seasonId, regionId) {
  const col = collection(firestore, 'seasons', seasonId, 'leaderboard')
  const q = regionId ? query(col, where('regionId', '==', regionId)) : query(col)
  const snap = await getDocs(q)

  // Drop archived entries on the RAW doc data — the previous `.filter(e => !e.archived)`
  // tested a field absent from the mapped object, so it never filtered anything.
  // Also extract the bare teamId: the doc id is the composite `${teamId}_${regionId}`,
  // not the bare id, so we need the field-or-split logic before joining to /teams.
  const rows = []
  for (const d of snap.docs) {
    const data = d.data()
    if (data.archived) continue
    const docId = d.id
    const teamId = data.teamId
      ?? data.team_id
      ?? (docId.includes('_') ? docId.split('_')[0] : docId)
    if (!teamId) continue
    rows.push({ teamId, data })
  }

  // Join to /teams and drop orphaned (missing doc) or inactive teams.
  const teamSnaps = await fetchTeamSnapsByIds(rows.map(r => r.teamId))

  return rows
    .filter(({ teamId }) => !isExcludedTeam(teamSnaps.get(teamId)))
    .map(({ teamId, data }) => ({
      team_id: teamId,
      team_name: data.teamName,
      total_points: data.totalPoints ?? 0,
      games_played: data.gamesPlayed ?? 0,
      rank: data.rank ?? 0,
      roundScores: data.roundScores ?? {},
    }))
    .sort(compareTeams)
}
