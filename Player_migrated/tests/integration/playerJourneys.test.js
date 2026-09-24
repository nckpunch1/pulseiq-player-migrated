// Player journeys: the REAL Player client (src/api/firebaseClient.js) against the
// REAL regional candidate rules (admin-host/rules/firestore.candidate.rules) in the
// Firestore emulator. Unit tests mock Firestore and the rules suite hand-writes
// payloads; this is the layer that catches the two drifting apart (as RG-02 did).
//
// Only the app's Firebase bootstrap is replaced: `firestore` becomes an emulator
// context for whichever user is "signed in", and Auth sign-up is simulated.
// No known gaps remain (INT-01..04 fixed), so normal and strict
// (npm run test:integration:rollout) runs are identical. A new gap should follow
// the KNOWN GAP convention: pin today's behaviour, demand the target under
// REGION_ROLLOUT_STRICT=1.
import process from 'node:process'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, setDoc, collection, collectionGroup, query, where, writeBatch, Timestamp } from 'firebase/firestore'

const actor = vi.hoisted(() => ({ firestore: null, auth: { currentUser: null }, signUp: null }))
vi.mock('../../src/lib/firebase', () => ({
  get firestore() { return actor.firestore },
  auth: actor.auth,
  db: {},
}))
vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn() }))
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(async (_auth, email) => actor.signUp(email)),
  deleteUser: vi.fn(async () => {}),
  sendEmailVerification: vi.fn(async () => {}),
  sendPasswordResetEmail: vi.fn(async () => {}),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(async () => {}),
}))

import { deleteUser } from 'firebase/auth'
import * as client from '../../src/api/firebaseClient'
import { clear as clearCache } from '../../src/api/cache'

const PROJECT = 'demo-pulseiq-player-int'
let env

// Act as `uid` from here on: every client call runs under that user's auth.
function as(uid, email = `${uid}@example.test`) {
  actor.firestore = env.authenticatedContext(uid, { email }).firestore()
  actor.auth.currentUser = { uid, email }
  clearCache()
}
async function seed(entries) {
  await env.withSecurityRulesDisabled(async context => {
    const batch = writeBatch(context.firestore())
    for (const [path, data] of Object.entries(entries)) batch.set(doc(context.firestore(), path), data)
    await batch.commit()
  })
}
async function peek(path) {
  let data
  await env.withSecurityRulesDisabled(async context => { data = (await getDoc(doc(context.firestore(), path))).data() })
  return data
}
// true when the call completes, false only when the RULES refuse it.
async function allowed(operation) {
  try { await operation; return true } catch (error) {
    if (error?.code === 'permission-denied') return false
    throw error
  }
}

beforeAll(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  if (host !== '127.0.0.1:8189') throw new Error('Run via npm run test:integration (emulator at 127.0.0.1:8189); no real project is allowed.')
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: '127.0.0.1', port: 8189, rules: await readFile(new URL('../../../../admin-host/rules/firestore.candidate.rules', import.meta.url), 'utf8') },
  })
})
afterAll(async () => { if (env) await env.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  actor.signUp = email => { const uid = email.split('@')[0]; as(uid, email); return { user: { uid, email } } }
  const future = Timestamp.fromMillis(Date.UTC(2030, 0, 1))
  await seed({
    'regions/north': { name: 'North', slug: 'north' },
    'regions/south': { name: 'South', slug: 'south' },
    // An established North team with a captain and a member.
    'teams/owls': { name: 'Owls', nameLower: 'owls', regionId: 'north', captainId: 'cap', captainName: 'Cap', memberCount: 2 },
    'teams/owls/members/cap': { userId: 'cap', role: 'captain', status: 'member', displayName: 'Cap' },
    'teams/owls/members/mem': { userId: 'mem', role: 'member', status: 'member', displayName: 'Mem' },
    'users/cap': { role: 'player', teamId: 'owls', regions: ['north'], displayName: 'Cap' },
    'users/mem': { role: 'player', teamId: 'owls', regions: ['north'], displayName: 'Mem' },
    // Same-name team in another region: must never surface for North players.
    'teams/owlsSouth': { name: 'Owls', nameLower: 'owls', regionId: 'south', captainId: 'southCap' },
    // Teamless North players.
    'users/solo': { role: 'player', teamId: null, regions: ['north'], displayName: 'Solo', username: 'solo@example.test' },
    'users/founder': { role: 'player', teamId: null, regions: ['north'], displayName: 'Founder' },
    // A South free agent (another region's player).
    'users/southSolo': { role: 'player', teamId: null, regions: ['south'], displayName: 'South Solo' },
    // Seasons and standings, one per region.
    'seasons/northSpring': { name: 'North Spring', regionId: 'north', status: 'active' },
    'seasons/northSpring/leaderboard/owls_north': { teamId: 'owls', teamName: 'Owls', regionId: 'north', totalPoints: 12, gamesPlayed: 2, rank: 1 },
    'seasons/southSpring': { name: 'South Spring', regionId: 'south', status: 'active' },
    'seasons/southSpring/leaderboard/owlsSouth_south': { teamId: 'owlsSouth', teamName: 'Owls', regionId: 'south', totalPoints: 99, gamesPlayed: 9, rank: 1 },
    // Games.
    'venues/pub': { name: 'North Pub', regionId: 'north' },
    'sessions/northNight': { name: 'North Night', regionId: 'north', venueId: 'pub', hostId: 'host', status: 'open', soldOut: false, visibility: 'public', date: future },
    'sessions/southNight': { name: 'South Night', regionId: 'south', venueId: 'southPub', hostId: 'host', status: 'open', soldOut: false, visibility: 'public', date: future },
  })
})

describe('signup (region at creation)', () => {
  it('a new player signs up into the region they picked', async () => {
    const result = await client.register({ first_name: 'New', last_name: 'Player', email: 'newbie@example.test', password: 'long-enough', region_id: 'north' })
    expect(result.requiresVerification).toBe(true)
    expect(await peek('users/newbie')).toMatchObject({ role: 'player', teamId: null, regions: ['north'], email: 'newbie@example.test' })
  })

  it('a region that does not exist creates no profile and removes the new account', async () => {
    await expect(client.register({ first_name: 'A', last_name: 'B', email: 'lost@example.test', password: 'long-enough', region_id: 'atlantis' })).rejects.toMatchObject({ code: 'REGION_NOT_FOUND' })
    expect(await peek('users/lost')).toBeUndefined()
    expect(deleteUser).toHaveBeenCalled()
  })
})

describe('founding a team', () => {
  it('a teamless player creates a team, becomes captain, and adopts it', async () => {
    as('founder')
    const { team } = await client.createTeam('Falcons', 'north')
    expect(await peek(`teams/${team.id}`)).toMatchObject({ name: 'Falcons', regionId: 'north', captainId: 'founder' })
    expect(await peek(`teams/${team.id}/members/founder`)).toMatchObject({ role: 'captain', status: 'member', userId: 'founder' })
    expect((await peek('users/founder')).teamId).toBe(team.id)
    expect((await client.getTeam()).membership).toMatchObject({ is_captain: true, team_id: team.id })
  })
})

describe('discovering and joining a team', () => {
  it('search is region-scoped: the same-name team in another region never appears', async () => {
    as('solo')
    const { teams } = await client.searchTeams('owl')
    expect(teams.map(t => [t.id, t.region_id])).toEqual([['owls', 'north']])
  })

  it('the Team page duplicate check (own rows only) is permitted before requesting', async () => {
    as('solo')
    // Same query Team.jsx handleJoin runs before calling requestToJoin.
    const existing = await getDocs(query(collection(actor.firestore, 'teams', 'owls', 'members'), where('userId', '==', 'solo')))
    expect(existing.empty).toBe(true)
  })

  it('request -> pending (grants nothing) -> repeat request is idempotent', async () => {
    as('solo')
    expect((await client.requestToJoin('owls')).request).toMatchObject({ id: 'solo', status: 'pending' })
    expect(await peek('teams/owls/members/solo')).toMatchObject({ userId: 'solo', status: 'pending', role: 'member' })
    expect((await client.requestToJoin('owls')).request.status).toBe('pending')
    // Pending grants no game data.
    expect(await allowed(getDoc(doc(actor.firestore, 'sessions', 'northNight')))).toBe(false)
  })

  it('the captain sees the request', async () => {
    as('solo'); await client.requestToJoin('owls')
    as('cap')
    expect((await client.getJoinRequests('owls')).requests).toEqual([expect.objectContaining({ id: 'solo', player_id: 'solo', status: 'pending' })])
  })

  it('a captain can reject a request', async () => {
    as('solo'); await client.requestToJoin('owls')
    as('cap')
    await client.handleJoinRequest('solo', 'reject')
    expect(await peek('teams/owls/members/solo')).toBeUndefined()
  })

  // INT-02 (fixed): approval accepts the member row only; the captain never writes
  // the applicant's profile (the rules refuse that). The applicant adopts the team.
  it('INT-02: a captain approves a join request; the applicant adopts the team and gains its region only', async () => {
    as('solo'); await client.requestToJoin('owls')
    as('cap')
    const { members } = await client.handleJoinRequest('solo', 'approve')
    expect(members.map(m => m.player_id)).toContain('solo')
    expect(await peek('teams/owls/members/solo')).toMatchObject({ status: 'member' })
    expect((await peek('users/solo')).teamId).toBeNull()
    as('solo')
    // Same own-rows collection-group query the Team.jsx approval watcher runs.
    const rows = await getDocs(query(collectionGroup(actor.firestore, 'members'), where('userId', '==', 'solo')))
    expect(rows.docs.map(d => d.data().status)).toEqual(['member'])
    await setDoc(doc(actor.firestore, 'users', 'solo'), { teamId: 'owls' }, { merge: true })
    expect((await client.getTeam()).team).toMatchObject({ id: 'owls' })
    expect(await allowed(getDoc(doc(actor.firestore, 'sessions', 'northNight')))).toBe(true)
    expect(await allowed(getDoc(doc(actor.firestore, 'sessions', 'southNight')))).toBe(false)
  })

  it('a player cannot request to join another region\'s team, even bypassing search', async () => {
    as('southSolo')
    expect(await allowed(client.requestToJoin('owls'))).toBe(false)
    expect(await peek('teams/owls/members/southSolo')).toBeUndefined()
  })

  it('a member leaves: own row removed, profile cleared', async () => {
    as('mem')
    await client.leaveTeam('owls')
    expect(await peek('teams/owls/members/mem')).toBeUndefined()
    expect((await peek('users/mem')).teamId).toBeNull()
  })
})

describe('captain invites', () => {
  // INT-04 (fixed): invites of registered players are resolved server-side
  // (/api/send-invite -> api/_lib/invitePlayer.js, tested in admin-host), so the
  // Player no longer reads other profiles. Reading them stays refused; a captain's
  // direct member write is also refused across regions (a team is single-region).
  it('INT-04: profile lookups by email stay refused, so the app must not need them', async () => {
    as('cap')
    expect(await allowed(getDocs(query(collection(actor.firestore, 'users'), where('email', '==', 'solo@example.test'))))).toBe(false)
  })

  it('a captain can add a same-region player, never a player from another region', async () => {
    as('cap')
    const add = uid => setDoc(doc(actor.firestore, 'teams', 'owls', 'members', uid), { userId: uid, displayName: uid, role: 'member', status: 'member' })
    expect(await allowed(add('southSolo'))).toBe(false)
    expect(await allowed(add('solo'))).toBe(true)
  })
})

describe('asking an admin for a team', () => {
  it('a teamless player\'s request carries their profile region, and they can withdraw it', async () => {
    as('solo')
    expect((await client.requestTeamFromAdmin('any team')).request).toEqual({ status: 'pending', region_id: 'north' })
    let requests
    await env.withSecurityRulesDisabled(async c => { requests = (await getDocs(collection(c.firestore(), 'teamRequests'))).docs.map(d => d.data()) })
    expect(requests).toEqual([expect.objectContaining({ playerId: 'solo', regionId: 'north', status: 'pending', note: 'any team' })])
    expect((await client.cancelTeamRequest()).cancelled).toBe(1)
    await env.withSecurityRulesDisabled(async c => { requests = (await getDocs(collection(c.firestore(), 'teamRequests'))).docs.map(d => d.data().status) })
    expect(requests).toEqual(['cancelled'])
  })

  it('a region-less account cannot file one (nothing to route it to)', async () => {
    await seed({ 'users/solo': { role: 'player', teamId: null, displayName: 'Solo' } })
    as('solo')
    await expect(client.requestTeamFromAdmin()).rejects.toMatchObject({ code: 'NEEDS_REGION' })
  })
})

describe('game registration (captain)', () => {
  it('register -> confirm -> cancel with the exact payloads the rules accept (RG-02)', async () => {
    as('cap')
    await client.registerForGame('northNight', 6)
    expect(await peek('sessions/northNight/registrations/owls')).toMatchObject({ teamId: 'owls', regionId: 'north', teamSize: 6, attendanceStatus: 'not_requested' })
    await client.confirmAttendance('northNight', 5)
    expect((await peek('sessions/northNight/registrations/owls')).attendanceStatus).toBe('confirmed')
    await client.cancelRegistration('northNight')
    expect((await peek('sessions/northNight/registrations/owls')).attendanceStatus).toBe('not_attending')
  })

  it('a registration for another region is refused by the client before any write (and the rules too)', async () => {
    as('cap')
    await expect(client.registerForGame('southNight', 6)).rejects.toMatchObject({ code: 'WRONG_REGION' })
    expect(await peek('sessions/southNight/registrations/owls')).toBeUndefined()
    // Belt and braces: the direct write is refused by the rules as well.
    const write = setDoc(doc(actor.firestore, 'sessions', 'southNight', 'registrations', 'owls'), { teamId: 'owls', regionId: 'south', teamName: 'Owls', teamSize: 6, attendanceStatus: 'not_requested' })
    expect(await allowed(write)).toBe(false)
  })

  it('the rules refuse an ordinary member acting for the team (PL-01 is only a client-message gap)', async () => {
    as('cap'); await client.registerForGame('northNight', 6)
    as('mem')
    expect(await allowed(client.confirmAttendance('northNight', 4))).toBe(false)
    expect(await allowed(client.cancelRegistration('northNight'))).toBe(false)
    expect((await peek('sessions/northNight/registrations/owls')).attendanceStatus).toBe('not_requested')
  })
})

describe('reading games and teams', () => {
  it('a member reads their own team', async () => {
    as('mem')
    const team = await client.getTeam()
    expect(team.team).toMatchObject({ id: 'owls', name: 'Owls' })
    expect(team.members.map(m => m.player_id).sort()).toEqual(['cap', 'mem'])
  })

  // INT-03 (fixed): games, the dashboard and leaderboards query the TEAM region
  // only, and registrations are read per session, so the rules permit every read.
  it('INT-03: a member sees only their team region\'s games, with their registration status', async () => {
    as('cap'); await client.registerForGame('northNight', 5)
    as('mem')
    const { games } = await client.getGames()
    expect(games.map(g => [g.id, g.registration_status])).toEqual([['northNight', 'registered']])
  })

  it('a teamless player sees no games and no dashboard games', async () => {
    as('solo')
    expect((await client.getGames()).games).toEqual([])
    expect((await client.dashboard()).upcoming_games).toEqual([])
  })

  it('the dashboard shows the team region\'s games and the team\'s season standing', async () => {
    as('mem')
    const dash = await client.dashboard()
    expect(dash.team).toMatchObject({ id: 'owls' })
    expect(dash.upcoming_games.map(g => g.id)).toEqual(['northNight'])
    expect(dash.leaderboard_summary).toMatchObject({ team_current_season_rank: 1 })
  })

  it('the captain dashboard also lists pending join requests', async () => {
    as('solo'); await client.requestToJoin('owls')
    as('cap')
    expect((await client.dashboard()).pending_join_requests.map(r => r.player_id)).toEqual(['solo'])
  })

  it('leaderboards show the team region only: its active season and all-time table', async () => {
    as('mem')
    const boards = await client.getLeaderboards()
    expect(boards.region_id).toBe('north')
    expect(boards.current_season).toMatchObject({ id: 'northSpring' })
    expect(boards.all_time_leaderboard.map(r => r.team_id)).toEqual(['owls'])
    expect((await client.getSeasonLeaderboard('northSpring', 'north')).map(r => r.team_id)).toEqual(['owls'])
  })

  it('a teamless player has no standings to show', async () => {
    as('solo')
    expect(await client.getLeaderboards()).toEqual({ current_season: null, all_time_leaderboard: [], region_id: null })
  })
})

describe('profile', () => {
  // INT-01 (fixed): the rename writes `displayName`, the field the app reads and
  // the rules allow; the dead `display_name` field is gone.
  it('INT-01: a player renames themselves and the app sees the new name', async () => {
    as('mem')
    await client.updateDisplayName('mem', 'Renamed')
    const profile = await peek('users/mem')
    expect(profile.displayName).toBe('Renamed')
    expect(profile).not.toHaveProperty('display_name')
    expect((await client.me()).player.display_name).toBe('Renamed')
  })
})
