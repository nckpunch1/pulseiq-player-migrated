import { beforeEach, expect, it, vi } from 'vitest'
const { docs, auth } = vi.hoisted(() => ({ docs: new Map(), auth: { currentUser: { uid: 'player' } } }))
vi.mock('../src/lib/firebase', () => ({ firestore: {}, db: {}, auth }))
vi.mock('firebase/auth', () => ({
  sendEmailVerification: vi.fn(), sendPasswordResetEmail: vi.fn(), signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(async () => ({ user: { uid: 'new-player' } })), signOut: vi.fn(),
}))
vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn() }))
vi.mock('firebase/firestore', () => {
  const path = (base, ...parts) => typeof base === 'string' ? [base, ...parts].join('/') : parts.join('/')
  const key = ref => ref.path ?? ref
  return {
    collection: path, collectionGroup: path, query: p => p, where: vi.fn(), limit: vi.fn(),
    doc: (base, ...parts) => parts.length ? path(base, ...parts) : { id: 'new-team', path: `${base}/new-team` },
    getDoc: vi.fn(async ref => ({ exists: () => docs.has(key(ref)), data: () => docs.get(key(ref)) })),
    getDocs: vi.fn(), serverTimestamp: () => 'TIME',
    setDoc: vi.fn(async (ref, data) => docs.set(key(ref), data)),
    updateDoc: vi.fn(async (ref, data) => docs.set(key(ref), { ...docs.get(key(ref)), ...data })),
    deleteDoc: vi.fn(),
    writeBatch: () => {
      const writes = []
      return { set: (ref, data) => writes.push([key(ref), data]), commit: async () => writes.forEach(([ref, data]) => docs.set(ref, data)) }
    },
  }
})
import { createTeam, registerForGame, register } from '../src/api/firebaseClient'
import { clear } from '../src/api/cache'
import { hasRegionAccess, regionSet, teamCreationRegion } from '../src/lib/regionAccess'
beforeEach(() => {
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
it('creates new profiles with array-valued region access, without assigning a guessed region', async () => {
  await register({ first_name: 'A', last_name: 'B', email: 'a@example.com', password: 'test-only' })
  expect(docs.get('users/new-player').regions).toEqual([])
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
