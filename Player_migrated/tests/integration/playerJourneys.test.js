// Player journeys: the REAL Player client (src/api/firebaseClient.js) against the
// REAL regional candidate rules (admin-host/rules/firestore.candidate.rules) in the
// Firestore emulator. Unit tests mock Firestore and the rules suite hand-writes
// payloads; this is the layer that catches the two drifting apart (as RG-02 did).
//
// Only the app's Firebase bootstrap is replaced: `firestore` becomes an emulator
// context for whichever user is "signed in", and Auth sign-up is simulated.
// Gaps follow the repo's KNOWN GAP convention: normal runs pin today's behaviour,
// REGION_ROLLOUT_STRICT=1 (npm run test:integration:rollout) demands the target.
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
const strictRollout = process.env.REGION_ROLLOUT_STRICT === '1'
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

  // INT-02: handleJoinRequest('approve') also writes the APPLICANT's users/{uid}.teamId
  // as the captain. The regional rules only let a player write their own profile, so
  // approval fails as a whole. Target: approval updates only the member row, and the
  // applicant adopts the team themselves (Team.jsx watcher, accepted rows only).
  it('INT-02 KNOWN GAP: a captain approves a join request under the regional rules', async () => {
    as('solo'); await client.requestToJoin('owls')
    as('cap')
    expect(await allowed(client.handleJoinRequest('solo', 'approve'))).toBe(strictRollout)
  })

  it('after approval the applicant adopts the team and gains its region only', async () => {
    as('solo'); await client.requestToJoin('owls')
    // Approval of the member row itself (the part the captain may do).
    as('cap')
    const { updateDoc } = await import('firebase/firestore')
    await updateDoc(doc(actor.firestore, 'teams', 'owls', 'members', 'solo'), { status: 'member' })
    as('solo')
    // Same own-rows collection-group query the Team.jsx approval watcher runs.
    const rows = await getDocs(query(collectionGroup(actor.firestore, 'members'), where('userId', '==', 'solo')))
    expect(rows.docs.map(d => d.data().status)).toEqual(['member'])
    await setDoc(doc(actor.firestore, 'users', 'solo'), { teamId: 'owls' }, { merge: true })
    expect((await client.getTeam()).team).toMatchObject({ id: 'owls' })
    expect(await allowed(getDoc(doc(actor.firestore, 'sessions', 'northNight')))).toBe(true)
    expect(await allowed(getDoc(doc(actor.firestore, 'sessions', 'southNight')))).toBe(false)
  })

  it('a member leaves: own row removed, profile cleared', async () => {
    as('mem')
    await client.leaveTeam('owls')
    expect(await peek('teams/owls/members/mem')).toBeUndefined()
    expect((await peek('users/mem')).teamId).toBeNull()
  })
})

describe('captain invites', () => {
  // INT-04: Team.jsx invites an existing player by first finding their profile with
  // users WHERE email == <address>. The regional rules only let a player read their
  // OWN profile, so the lookup is refused and inviting a registered player fails.
  // Target: an invite path that does not need to read other players' profiles
  // (e.g. server-side lookup), with the member write still captain-scoped.
  it('INT-04 KNOWN GAP: a captain looks up a registered player by email to invite them', async () => {
    as('cap')
    // Same query Team.jsx handleInvitePlayer runs.
    const lookup = getDocs(query(collection(actor.firestore, 'users'), where('email', '==', 'solo@example.test')))
    expect(await allowed(lookup)).toBe(strictRollout)
  })

  it('the captain-scoped member write itself is permitted (members/{uid}, accepted)', async () => {
    as('cap')
    await setDoc(doc(actor.firestore, 'teams', 'owls', 'members', 'solo'), { userId: 'solo', displayName: 'Solo', role: 'member', status: 'member' })
    expect(await peek('teams/owls/members/solo')).toMatchObject({ status: 'member' })
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

  it('the rules refuse a registration for another region, whatever the client does', async () => {
    as('cap')
    expect(await allowed(client.registerForGame('southNight', 6))).toBe(false)
    expect(await peek('sessions/southNight/registrations/owls')).toBeUndefined()
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

  // INT-03: getGames queries sessions by status only (no region constraint) and
  // reads registrations through a collection-group query, both of which the
  // regional rules refuse. The whole Games list fails for every player, not just
  // shows extra games (PL-03/PL-04 describe the client-side symptom).
  it('INT-03 KNOWN GAP: a member loads their games list under the regional rules', async () => {
    as('mem')
    expect(await allowed(client.getGames())).toBe(strictRollout)
  })
})

describe('profile', () => {
  // INT-01: Profile writes `display_name`, which nothing reads (every reader uses
  // `displayName`) and which the regional rules do not allow a player to set.
  it('INT-01 KNOWN GAP: a player renames themselves and the app sees the new name', async () => {
    as('mem')
    const renamed = await allowed(client.updateDisplayName('mem', 'Renamed'))
    const visible = renamed && (await peek('users/mem')).displayName === 'Renamed'
    expect(visible).toBe(strictRollout)
  })
})
