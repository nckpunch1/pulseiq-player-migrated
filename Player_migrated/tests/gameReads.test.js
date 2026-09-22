import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const { records, auth } = vi.hoisted(() => ({ records: new Map(), auth: { currentUser: { uid: 'p' } } }))
vi.mock('../src/lib/firebase', () => ({ auth, firestore: {}, db: {} }))
vi.mock('firebase/auth', () => ({ sendEmailVerification: vi.fn(), sendPasswordResetEmail: vi.fn(), signInWithEmailAndPassword: vi.fn(), createUserWithEmailAndPassword: vi.fn(), signOut: vi.fn() }))
vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn() }))
vi.mock('firebase/firestore', () => {
  const path = (base, ...parts) => typeof base === 'string' ? [base, ...parts].join('/') : parts.join('/')
  const snap = p => ({ id: p.split('/').at(-1), exists: () => records.has(p), data: () => records.get(p), ref: p })
  return {
    doc: path, collection: path, collectionGroup: (_db, group) => ({ group }),
    query: (path, ...filters) => ({ path, filters }), where: (field, op, value) => ({ field, op, value }), limit: n => ({ limit: n }),
    getDoc: vi.fn(async p => snap(p)),
    getDocs: vi.fn(async source => {
      const p = source.path ?? source
      let selected = [...records.keys()].filter(key => source.group ? key.split('/').at(-2) === source.group : key.startsWith(`${p}/`) && key.split('/').length === p.split('/').length + 1)
      for (const f of source.filters ?? []) {
        if (f.limit) selected = selected.slice(0, f.limit)
        else {
          if (f.op !== '==') throw new Error('Unsupported fixture operator')
          selected = selected.filter(key => records.get(key)[f.field] === f.value)
        }
      }
      return { docs: selected.map(snap), empty: selected.length === 0 }
    }),
    updateDoc: vi.fn(async (p, data) => records.set(p, { ...records.get(p), ...data })),
    setDoc: vi.fn(), deleteDoc: vi.fn(), writeBatch: vi.fn(), serverTimestamp: vi.fn(),
  }
})
import { getDoc, getDocs, updateDoc } from 'firebase/firestore'
import { getGameDetails, getSeasonLeaderboard, getLeaderboards, listRegions } from '../src/api/firebaseClient'
import { clear } from '../src/api/cache'
beforeEach(() => {
  vi.clearAllMocks(); records.clear(); clear()
  records.set('users/p', { teamId: 'a' })
  records.set('teams/a', { name: 'Alpha', captainId: 'p' })
  records.set('teams/a/members/random-id', { userId: 'p', role: 'captain' })
  records.set('sessions/night', { name: 'Quiz', status: 'open', venueId: 'pub', startsAt: { toDate: () => new Date('2026-09-22T08:00:00Z') } })
  records.set('venues/pub', { name: 'The Pub' })
})
afterEach(clear)
it('maps a game and legacy member identity with no registration', async () => {
  expect(await getGameDetails('night')).toMatchObject({
    game: { name: 'Quiz', venue: 'The Pub', starts_at: '2026-09-22T08:00:00.000Z', game_state: null },
    team: { id: 'a', name: 'Alpha' }, membership: { is_captain: true, is_scribe: true }, registration: null, can_register: true,
  })
  expect(updateDoc).not.toHaveBeenCalled()
})
it('missing games fail clearly without writes', async () => {
  await expect(getGameDetails('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect(updateDoc).not.toHaveBeenCalled()
})
it.each([
  ['open', false, true], ['scheduled', false, true], ['live', false, false], ['completed', false, false], ['open', true, false],
])('registration visibility for %s, soldOut=%s', async (status, soldOut, allowed) => {
  records.set('sessions/night', { status, soldOut })
  expect((await getGameDetails('night')).can_register).toBe(allowed)
})
it.each([
  ['checked_in', 'checked_in'], ['no_show', 'no_show'], ['attending', 'confirmed'], ['present', 'confirmed'], ['confirmed', 'confirmed'],
  ['attendance_requested', 'confirmation_requested'], ['confirmation_requested', 'confirmation_requested'], [undefined, 'registered'],
])('normalizes attendance %s for the game UI', async (attendanceStatus, expected) => {
  records.set('sessions/night/registrations/a', { teamId: 'a', attendanceStatus, teamSize: 5, confirmedTeamSize: 4 })
  const result = await getGameDetails('night')
  expect(result.registration).toMatchObject({ expected_team_size: 5, confirmed_team_size: 4, registration_status: expected })
  expect(result.can_register).toBe(false)
})
it('completed games do not offer attendance confirmation even when a request remains', async () => {
  records.set('sessions/night/registrations/a', { teamId: 'a', attendanceStatus: 'confirmation_requested' })
  expect((await getGameDetails('night')).can_confirm_attendance).toBe(true)
  records.set('sessions/night', { status: 'completed' })
  expect((await getGameDetails('night')).can_confirm_attendance).toBe(false)
})
it('teamless detail reads retain venue data but offer no registration actions', async () => {
  records.set('users/p', { teamId: null })
  expect(await getGameDetails('night')).toMatchObject({ team: null, membership: null, registration: null, can_register: false, can_confirm_attendance: false, game: { venue: 'The Pub' } })
})
it('missing venue documents fall back to the stored venue name', async () => {
  records.delete('venues/pub')
  records.set('sessions/night', { venueId: 'pub', venue: 'Legacy pub', status: 'open', startsAt: '2026-09-22' })
  expect((await getGameDetails('night')).game).toMatchObject({ venue: 'Legacy pub', starts_at: '2026-09-22' })
})
function board() {
  records.set('teams/b', { isActive: true })
  records.set('teams/inactive', { isActive: false })
  records.set('seasons/s1', { status: 'active', name: 'Spring' })
  records.set('seasons/s1/leaderboard/a_north', { teamId: 'a', teamName: 'Alpha', regionId: 'north', totalPoints: 10, gamesPlayed: 1, roundScores: { 1: 7, 2: 3 } })
  records.set('seasons/s1/leaderboard/b_north', { teamId: 'b', teamName: 'Beta', regionId: 'north', totalPoints: 10, gamesPlayed: 1, roundScores: { 1: 6, 2: 4 } })
  records.set('seasons/s1/leaderboard/missing_north', { teamId: 'missing', regionId: 'north', totalPoints: 999 })
  records.set('seasons/s1/leaderboard/inactive_north', { teamId: 'inactive', regionId: 'north', totalPoints: 999 })
  records.set('seasons/s1/leaderboard/archived_north', { teamId: 'a', regionId: 'north', archived: true, totalPoints: 999 })
  records.set('seasons/s1/leaderboard/a_south', { teamId: 'a', regionId: 'south', totalPoints: 99 })
}
it('season standings exclude archived/inactive/orphan rows and break ties from the last round', async () => {
  board()
  const rows = await getSeasonLeaderboard('s1', 'north')
  expect(rows.map(r => r.team_id)).toEqual(['b', 'a'])
  expect(rows.map(r => r.total_points)).toEqual([10, 10])
  expect(getDocs).toHaveBeenCalledWith(expect.objectContaining({ filters: [{ field: 'regionId', op: '==', value: 'north' }] }))
})
it('aggregates only retained teams across seasons and deduplicates team reads', async () => {
  board()
  records.set('seasons/s2/leaderboard/a_north', { teamId: 'a', regionId: 'north', totalPoints: 5, gamesPlayed: 2 })
  const result = await getLeaderboards('north')
  expect(result.current_season.id).toBe('s1')
  expect(result.all_time_leaderboard).toMatchObject([
    { team_id: 'a', total_points: 15, games_played: 3, rank: 1 },
    { team_id: 'b', total_points: 10, games_played: 1, rank: 2 },
  ])
  expect(getDoc.mock.calls.filter(([p]) => p === 'teams/a')).toHaveLength(1)
})
it('supports legacy bare/composite identities and snake-case fields without losing zero totals', async () => {
  records.set('seasons/old/leaderboard/a_north', { regionId: 'north', team_name: 'Alpha', total_points: 0, games_played: 2 })
  expect((await getLeaderboards('north')).all_time_leaderboard).toEqual([{ team_id: 'a', team_name: 'Alpha', total_points: 0, games_played: 2, rank: 1 }])
})
it('does not reuse another season or region cache entry', async () => {
  board()
  expect((await getSeasonLeaderboard('s1', 'north')).map(r => r.total_points)).toEqual([10, 10])
  expect((await getSeasonLeaderboard('s1', 'south')).map(r => r.total_points)).toEqual([99])
  expect(await getSeasonLeaderboard('s2', 'north')).toEqual([])
})
it('lists region IDs/names and deduplicates repeated discovery reads', async () => {
  records.set('regions/north', { name: 'North', privateExtra: 'omit' })
  expect(await listRegions()).toEqual([{ id: 'north', name: 'North' }])
  await listRegions()
  expect(getDocs).toHaveBeenCalledTimes(1)
})
