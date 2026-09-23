import process from 'node:process'
import { beforeEach, expect, it, vi } from 'vitest'
const { docs, auth } = vi.hoisted(() => ({ docs: new Map(), auth: { currentUser: { uid: 'player' } } }))
vi.mock('../src/lib/firebase', () => ({ firestore: {}, db: {}, auth }))
vi.mock('firebase/auth', () => ({
  sendEmailVerification: vi.fn(), sendPasswordResetEmail: vi.fn(), signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(async () => ({ user: { uid: 'new-player' } })), deleteUser: vi.fn(async () => {}), signOut: vi.fn(),
}))
vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn() }))
vi.mock('firebase/firestore', () => {
  const path = (base, ...parts) => typeof base === 'string' ? [base, ...parts].join('/') : parts.join('/')
  const key = ref => ref.path ?? ref
  return {
    collection: path, collectionGroup: path,
    query: (p, ...filters) => ({ path: p, filters: filters.filter(Boolean) }), where: (field, op, value) => ({ field, op, value }), limit: vi.fn(),
    doc: (base, ...parts) => parts.length ? path(base, ...parts) : { id: 'new-team', path: `${base}/new-team` },
    getDoc: vi.fn(async ref => ({ exists: () => docs.has(key(ref)), data: () => docs.get(key(ref)) })),
    getDocs: vi.fn(async ref => {
      const prefix = `${key(ref)}/`
      const entries = [...docs].filter(([p, data]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')
        && (ref.filters ?? []).every(({ field, op, value }) => op === 'in' ? value.includes(data[field])
          : op === '>=' ? data[field] >= value : op === '<=' ? data[field] <= value : data[field] === value))
      return { docs: entries.map(([p, data]) => ({ id: p.split('/').at(-1), ref: p, data: () => data })) }
    }), serverTimestamp: () => 'TIME',
    setDoc: vi.fn(async (ref, data) => docs.set(key(ref), data)),
    updateDoc: vi.fn(async (ref, data) => docs.set(key(ref), { ...docs.get(key(ref)), ...data })),
    deleteDoc: vi.fn(async ref => docs.delete(key(ref))),
    writeBatch: () => {
      const writes = []
      return { set: (ref, data) => writes.push([key(ref), data]), commit: async () => writes.forEach(([ref, data]) => docs.set(ref, data)) }
    },
  }
})
import { searchTeams, createTeam, registerForGame, register, getGames, confirmAttendance, cancelRegistration, getTeamId, peekTeamId, peekGames, peekDashboard, logout, resetPassword, resendVerificationEmail, requestToJoin, getJoinRequests, handleJoinRequest, leaveTeam } from '../src/api/firebaseClient'
import { getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { isAcceptedMemberRow } from '../src/lib/membership'
import { signOut, sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth'
import { clear, cacheKey, set as seedCache, getStale } from '../src/api/cache'
import { hasRegionAccess, regionSet, teamCreationRegion } from '../src/lib/regionAccess'
beforeEach(() => {
  vi.clearAllMocks()
  auth.currentUser = { uid: 'player' }
  docs.clear(); clear()
  docs.set('users/player', { displayName: 'Player', regions: ['north'] })
  docs.set('regions/north', { name: 'North' })
  docs.set('regions/south', { name: 'South' })
})

it('creates a team in the only distinct profile region', async () => {
  docs.set('users/player', { regions: ['north', 'north'] })
  await createTeam('Alpha')
  expect(docs.get('teams/new-team')).toMatchObject({ name: 'Alpha', regionId: 'north', captainId: 'player' })
  expect(docs.get('users/player').regions).toEqual(['north', 'north'])
})
it.each([[], ['north', 'south'], 'north', undefined])('requires selection for ambiguous/missing profile regions: %j', async regions => {
  docs.set('users/player', { regions })
  await expect(createTeam('Alpha')).rejects.toThrow('region')
  expect(docs.has('teams/new-team')).toBe(false)
  await createTeam('Alpha', 'south')
  expect(docs.get('teams/new-team').regionId).toBe('south')
})
it('rejects a nonexistent explicit region without creating a team', async () => {
  await expect(createTeam('Alpha', 'missing')).rejects.toThrow('existing region')
  expect(docs.has('teams/new-team')).toBe(false)
})
it('creates new profiles with exactly the region the player selected, as a doc-ID array', async () => {
  await register({ first_name: 'A', last_name: 'B', email: 'a@example.com', password: 'test-only', region_id: 'south' })
  expect(docs.get('users/new-player').regions).toEqual(['south'])
})
it('signup never guesses a region: none selected, or one that does not exist, creates no profile', async () => {
  await expect(register({ first_name: 'A', last_name: 'B', email: 'a@example.com', password: 'test-only' })).rejects.toMatchObject({ code: 'REGION_REQUIRED' })
  await expect(register({ first_name: 'A', last_name: 'B', email: 'a@example.com', password: 'test-only', region_id: 'missing' })).rejects.toMatchObject({ code: 'REGION_NOT_FOUND' })
  expect(docs.has('users/new-player')).toBe(false)
})
it('tags registrations from the session, not the team or profile', async () => {
  docs.set('users/player', { teamId: 'a', regions: ['north'] })
  docs.set('teams/a', { name: 'Alpha', regionId: 'north' })
  docs.set('sessions/night', { regionId: 'south' })
  await registerForGame('night', 8)
  expect(docs.get('sessions/night/registrations/a')).toMatchObject({ regionId: 'south', teamSize: 8, attendanceStatus: 'not_requested' })
})
it('rejects new registrations without a parent region but never backfills an existing registration', async () => {
  docs.set('users/player', { teamId: 'a' })
  docs.set('sessions/night', {})
  await expect(registerForGame('night', 8)).rejects.toThrow('region')
  expect(docs.has('sessions/night/registrations/a')).toBe(false)
  docs.set('sessions/night/registrations/a', { teamId: 'a' })
  await registerForGame('night', 8)
  expect(docs.get('sessions/night/registrations/a')).not.toHaveProperty('regionId')
  docs.set('sessions/night/registrations/a', { teamId: 'a', regionId: 'north' })
  await registerForGame('night', 8)
  expect(docs.get('sessions/night/registrations/a').regionId).toBe('north')
})
it('uses set semantics for single and multi-region profiles without scalar coercion', () => {
  expect(regionSet({ regions: ['north', 'north', 'south'] })).toEqual(['north', 'south'])
  expect(hasRegionAccess({ regions: ['north'] }, 'north')).toBe(true)
  expect(hasRegionAccess({ regions: ['north', 'south'] }, 'south')).toBe(true)
  expect(hasRegionAccess({ regions: 'north' }, 'north')).toBe(false)
  expect(() => teamCreationRegion({})).toThrow('region')
})

// These are executable contracts for the real client functions with an in-memory
// Firestore adapter, not an assertion that the current live rules enforce them.
const strictRollout = process.env.REGION_ROLLOUT_STRICT === '1'
function seedPlayerJourney({ captain = 'player', teamRegion = 'north', sessionRegion = 'north' } = {}) {
  docs.set('users/player', { role: 'player', teamId: 'a', regions: ['south'] })
  docs.set('teams/a', { name: 'Alpha', regionId: teamRegion, captainId: captain })
  docs.set('teams/a/members/player', { userId: 'player', status: 'member', role: captain === 'player' ? 'captain' : 'member' })
  docs.set('sessions/night', { name: 'North night', regionId: sessionRegion, status: 'open', visibility: 'public', soldOut: false })
}
// Only application rejections count: incidental mock/infrastructure errors fail.
async function applicationRejected(operation) {
  try { await operation; return false } catch (error) {
    if (error.name === 'ApiError') return true
    throw error
  }
}
it('a captain can register a team in its own region despite a different profile hint', async () => {
  seedPlayerJourney()
  await registerForGame('night', 6)
  expect(docs.get('sessions/night/registrations/a')).toMatchObject({ teamId: 'a', regionId: 'north', teamSize: 6 })
})
it('RG-02: a captain cancel writes exactly the not_attending payload the regional rules accept', async () => {
  seedPlayerJourney()
  docs.set('sessions/night/registrations/a', { teamId: 'a', regionId: 'north', attendanceStatus: 'confirmed' })
  await cancelRegistration('night')
  expect(updateDoc).toHaveBeenCalledWith('sessions/night/registrations/a', { attendanceStatus: 'not_attending' })
})
it('teamless registration fails without any registration writes', async () => {
  await expect(registerForGame('night', 6)).rejects.toMatchObject({ code: 'NO_TEAM' })
  expect(setDoc).not.toHaveBeenCalled()
})
it('sold-out session rejects a stale registration attempt before writing', async () => {
  seedPlayerJourney()
  docs.set('sessions/night', { regionId: 'north', soldOut: true })
  await expect(registerForGame('night', 6)).rejects.toMatchObject({ code: 'SOLD_OUT' })
  expect(setDoc).not.toHaveBeenCalled()
})
it.each([
  ['register', () => registerForGame('night', 6)],
  ['confirm', () => confirmAttendance('night', 6)],
  ['cancel', () => cancelRegistration('night')],
])('PL-01 KNOWN GAP: an ordinary member cannot %s on behalf of the team', async (_action, invoke) => {
  seedPlayerJourney({ captain: 'anotherPlayer' })
  const denied = await applicationRejected(invoke())
  expect(denied).toBe(strictRollout)
  if (strictRollout) {
    expect(setDoc).not.toHaveBeenCalled()
    expect(updateDoc).not.toHaveBeenCalled()
  }
})
it('PL-02 KNOWN GAP: a captain cannot register a team in another region', async () => {
  seedPlayerJourney({ sessionRegion: 'south' })
  expect(await applicationRejected(registerForGame('night', 6))).toBe(strictRollout)
  if (strictRollout) expect(setDoc).not.toHaveBeenCalled()
})
it('PL-03 KNOWN GAP: teamless players receive no games and issue no sessions query', async () => {
  docs.set('sessions/night', { regionId: 'north', status: 'open', visibility: 'public' })
  const result = await getGames()
  expect(result.games.map(game => game.id)).toEqual(strictRollout ? [] : ['night'])
  if (strictRollout) expect(getDocs).not.toHaveBeenCalled()
})
it('PL-04 KNOWN GAP: game discovery queries and returns only the team region', async () => {
  seedPlayerJourney()
  docs.set('sessions/foreign', { regionId: 'south', status: 'open', visibility: 'public' })
  const result = await getGames()
  expect(result.games.map(game => game.id).sort()).toEqual(strictRollout ? ['night'] : ['foreign', 'night'])
  if (strictRollout) {
    const sessionQueries = getDocs.mock.calls.map(([q]) => q).filter(q => q.path === 'sessions')
    expect(sessionQueries.length).toBeGreaterThan(0)
    for (const q of sessionQueries) expect(q.filters).toContainEqual({ field: 'regionId', op: '==', value: 'north' })
  }
})

it('cached team reads stay separated when accounts switch on a shared device', async () => {
  docs.set('users/player', { teamId: 'a' })
  docs.set('users/second', { teamId: 'b' })
  expect(await getTeamId()).toBe('a')
  auth.currentUser = { uid: 'second' }
  expect(peekTeamId()).toBeUndefined()
  expect(await getTeamId()).toBe('b')
  expect(peekTeamId()).toBe('b')
})
it('team cache distinguishes unknown from a known teamless profile', async () => {
  expect(peekTeamId()).toBeUndefined()
  expect(await getTeamId()).toBeNull()
  expect(peekTeamId()).toBeNull()
})
it('successful sign-out removes cached account and leaderboard data', async () => {
  seedCache(cacheKey('getGames', 'player'), { games: ['old'] })
  seedCache(cacheKey('getLeaderboards', 'north'), ['old standings'])
  await logout()
  expect(signOut).toHaveBeenCalledWith(auth)
  expect(peekGames()).toBeUndefined()
  expect(getStale(cacheKey('getLeaderboards', 'north'))).toBeUndefined()
})
it('signed-out render peeks are safe and reads reject authentication', async () => {
  auth.currentUser = null
  expect(peekGames()).toBeUndefined()
  expect(peekDashboard()).toBeUndefined()
  expect(peekTeamId()).toBeUndefined()
  await expect(getGames()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  await expect(registerForGame('night', 4)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  await expect(resendVerificationEmail()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  expect(setDoc).not.toHaveBeenCalled()
})
it('password reset normalizes the email before sending', async () => {
  await resetPassword('  Player@Example.COM ')
  expect(sendPasswordResetEmail).toHaveBeenCalledWith(auth, 'player@example.com')
})
it('password reset maps Firebase invalid-email errors into application errors', async () => {
  sendPasswordResetEmail.mockRejectedValueOnce({ code: 'auth/invalid-email' })
  await expect(resetPassword('bad')).rejects.toMatchObject({ code: 'INVALID_EMAIL' })
})
it('verification targets the current authenticated user', async () => {
  await resendVerificationEmail()
  expect(sendEmailVerification).toHaveBeenCalledWith(auth.currentUser)
})
it('join request remains pending and does not silently assign a team', async () => {
  const result = await requestToJoin('a')
  expect(result.request).toMatchObject({ id: 'player', team_id: 'a', status: 'pending' })
  // RG-01: the row is keyed on the requester's uid, never a generated ID.
  expect(docs.get('teams/a/members/player')).toMatchObject({ userId: 'player', status: 'pending', role: 'member', requestedAt: 'TIME' })
  expect([...docs.keys()].filter(p => p.startsWith('teams/a/members/'))).toEqual(['teams/a/members/player'])
  expect(docs.get('users/player').teamId).toBeUndefined()
})
it('a repeated join request is idempotent when the rules deny re-setting the existing pending row', async () => {
  docs.set('teams/a/members/player', { userId: 'player', status: 'pending', role: 'member' })
  setDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }))
  expect((await requestToJoin('a')).request).toMatchObject({ id: 'player', status: 'pending' })
  expect(docs.get('teams/a/members/player').status).toBe('pending')
})
it('a join request never downgrades an accepted member to pending', async () => {
  docs.set('teams/a/members/player', { userId: 'player', status: 'member', role: 'member' })
  setDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }))
  await expect(requestToJoin('a')).rejects.toMatchObject({ code: 'ALREADY_MEMBER' })
  expect(docs.get('teams/a/members/player').status).toBe('member')
})
it('unrelated join-request failures are not swallowed', async () => {
  setDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }))
  await expect(requestToJoin('a')).rejects.toThrow('denied')
})
it('join request list excludes accepted members and other teams', async () => {
  docs.set('teams/a/members/pending', { userId: 'applicant', status: 'pending', displayName: 'Applicant' })
  docs.set('teams/a/members/accepted', { userId: 'member', status: 'member' })
  docs.set('teams/b/members/foreign', { userId: 'foreign', status: 'pending' })
  expect((await getJoinRequests('a')).requests).toEqual([expect.objectContaining({ id: 'pending', player_id: 'applicant', player_name: 'Applicant' })])
})
it('approval activates membership, assigns the applicant team and invalidates cached team state', async () => {
  seedPlayerJourney()
  docs.set('users/applicant', { teamId: null })
  docs.set('teams/a/members/request', { userId: 'applicant', status: 'pending', displayName: 'Applicant' })
  seedCache(cacheKey('getTeamId', 'player'), 'a')
  seedCache(cacheKey('getGames', 'player'), { games: ['old'] })
  const result = await handleJoinRequest('request', 'approve')
  expect(docs.get('teams/a/members/request')).toMatchObject({ status: 'member', role: 'member' })
  expect(docs.get('users/applicant').teamId).toBe('a')
  expect(result.members).toContainEqual(expect.objectContaining({ player_id: 'applicant', status: 'active', is_captain: false }))
  expect(peekTeamId()).toBeUndefined()
  expect(peekGames()).toBeUndefined()
})
it('rejecting a join request removes only that request without assigning a team', async () => {
  seedPlayerJourney()
  docs.set('users/applicant', { teamId: null })
  docs.set('teams/a/members/request', { userId: 'applicant', status: 'pending' })
  await handleJoinRequest('request', 'reject')
  expect(docs.has('teams/a/members/request')).toBe(false)
  expect(docs.has('teams/a/members/player')).toBe(true)
  expect(docs.get('users/applicant').teamId).toBeNull()
})
it('leaving removes all own legacy membership rows but preserves teammates and other teams', async () => {
  seedPlayerJourney()
  docs.set('teams/a/members/legacy', { userId: 'player', status: 'member' })
  docs.set('teams/a/members/other', { userId: 'other', status: 'member' })
  docs.set('teams/b/members/other', { userId: 'other', status: 'member' })
  seedCache(cacheKey('getTeamId', 'player'), 'a')
  await leaveTeam('a')
  expect(docs.get('users/player').teamId).toBeNull()
  expect(docs.has('teams/a/members/player')).toBe(false)
  expect(docs.has('teams/a/members/legacy')).toBe(false)
  expect(docs.has('teams/a/members/other')).toBe(true)
  expect(docs.has('teams/b/members/other')).toBe(true)
  expect(peekTeamId()).toBeUndefined()
})

// Team discovery: scoped to the PROFILE region in the query itself.
function seedDiscovery() {
  docs.set('users/player', { role: 'player', teamId: null, regions: ['north'] })
  docs.set('teams/northAlpha', { name: 'Alpha', nameLower: 'alpha', regionId: 'north', memberCount: 3, captainName: 'N' })
  docs.set('teams/southAlpha', { name: 'Alpha', nameLower: 'alpha', regionId: 'south', memberCount: 5, captainName: 'S' })
  docs.set('teams/northBeta', { name: 'Beta', nameLower: 'beta', regionId: 'north' })
}
it('searchTeams region-scopes the QUERY to the profile region, so same-name teams elsewhere never appear', async () => {
  seedDiscovery()
  const { teams } = await searchTeams('Alp')
  expect(teams).toEqual([{ id: 'northAlpha', name: 'Alpha', region_id: 'north', member_count: 3, captain_name: 'N' }])
  const [ref] = getDocs.mock.calls.at(-1)
  expect(ref.path).toBe('teams')
  expect(ref.filters).toContainEqual({ field: 'regionId', op: '==', value: 'north' })
})
it('a multi-region profile searches only its own regions', async () => {
  seedDiscovery()
  docs.set('users/player', { role: 'player', teamId: null, regions: ['north', 'east'] })
  expect((await searchTeams('alpha')).teams.map(t => t.id)).toEqual(['northAlpha'])
  expect(getDocs.mock.calls.at(-1)[0].filters).toContainEqual({ field: 'regionId', op: 'in', value: ['north', 'east'] })
})
it.each([[[]], [undefined], ['north'], [['', '  ']]])('a region-less profile (%j) gets no global search, just a needs_region signal', async regions => {
  seedDiscovery()
  docs.set('users/player', { role: 'player', teamId: null, regions })
  expect(await searchTeams('alpha')).toEqual({ teams: [], needs_region: true })
  expect(getDocs).not.toHaveBeenCalled()
})
it('only an accepted member row can assign a team (pending requests never do)', () => {
  const row = status => ({ data: () => (status === undefined ? { userId: 'p' } : { userId: 'p', status }) })
  expect([row('member'), row(undefined), row('pending'), row('rejected'), row('removed')].map(isAcceptedMemberRow)).toEqual([true, true, false, false, false])
})
