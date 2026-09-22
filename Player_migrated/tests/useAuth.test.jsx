// @vitest-environment jsdom
import { useEffect } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ listener: null, stop: vi.fn(), profile: {}, missing: false, failure: null }))
const api = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn() }))
vi.mock('../src/lib/firebase', () => ({ auth: {}, firestore: {} }))
vi.mock('../src/api/client', () => ({ api }))
vi.mock('firebase/auth', () => ({ onAuthStateChanged: (_auth, callback) => { fixture.listener = callback; return fixture.stop } }))
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => parts.join('/'),
  getDoc: vi.fn(async () => {
    if (fixture.failure) throw fixture.failure
    return { exists: () => !fixture.missing, data: () => fixture.profile }
  }),
}))
import { AuthProvider, useAuth } from '../src/hooks/useAuth'
let context
function Consumer() {
  const auth = useAuth()
  useEffect(() => { context = auth }, [auth])
  return <p>{auth.isLoggedIn ? auth.player.display_name || 'Unnamed' : 'Signed out'}</p>
}
const mount = () => render(<AuthProvider><Consumer /></AuthProvider>)
const emit = user => act(async () => fixture.listener(user))
beforeEach(() => {
  fixture.profile = { email: 'player@example.test', displayName: 'Player', firstName: 'First', lastName: 'Last' }
  fixture.missing = false
  fixture.failure = null
  fixture.stop.mockClear()
  api.login.mockReset()
  api.logout.mockReset()
  context = undefined
})
afterEach(cleanup)
it('waits for initial Firebase state instead of flashing a signed-out screen', async () => {
  mount()
  expect(screen.queryByText('Signed out')).toBeNull()
  await emit(null)
  expect(screen.getByText('Signed out')).toBeTruthy()
  expect(context).toMatchObject({ isLoggedIn: false, loading: false, token: null })
})
it.each([
  [true, false, false], [false, true, false], [false, false, true],
])('derives verification from Firebase=%s and manual=%s', async (emailVerified, manuallyVerified, requiresVerification) => {
  fixture.profile.manuallyVerified = manuallyVerified
  mount()
  await emit({ uid: 'p', emailVerified })
  expect(context).toMatchObject({ token: 'p', isLoggedIn: true, requiresVerification, player: { id: 'p', display_name: 'Player', first_name: 'First', last_name: 'Last' } })
})
it('keeps a verified Auth session usable when Firestore is offline', async () => {
  fixture.failure = new Error('offline')
  mount()
  await emit({ uid: 'p', emailVerified: true, email: 'auth@example.test', displayName: 'Auth name' })
  expect(context).toMatchObject({ isLoggedIn: true, requiresVerification: false, player: { email: 'auth@example.test', display_name: 'Auth name' } })
})
it('does not treat an unverified offline account as verified', async () => {
  fixture.failure = new Error('offline')
  mount()
  await emit({ uid: 'p', emailVerified: false })
  expect(context).toMatchObject({ isLoggedIn: true, requiresVerification: true })
})
it('tolerates an absent profile without granting captaincy', async () => {
  fixture.missing = true
  mount()
  await emit({ uid: 'p', emailVerified: false })
  expect(context).toMatchObject({ isCaptain: false, requiresVerification: true, player: { id: 'p', email: null, display_name: '' } })
})
it('merges partial responses and clears captain state when membership is explicitly removed', async () => {
  mount()
  await emit({ uid: 'p', emailVerified: true })
  act(() => context.setSessionFromResponse({ membership: { is_captain: true }, player: { display_name: 'Renamed' } }))
  expect(context.player).toMatchObject({ id: 'p', display_name: 'Renamed', first_name: 'First' })
  expect(context.isCaptain).toBe(true)
  act(() => context.setSessionFromResponse({ membership: null, requiresVerification: true }))
  expect(context).toMatchObject({ isCaptain: false, requiresVerification: true })
})
it('clears profile, captain and verification state when Firebase signs out', async () => {
  mount()
  await emit({ uid: 'p', emailVerified: false })
  act(() => context.setSessionFromResponse({ membership: { is_captain: true } }))
  await emit(null)
  expect(context).toMatchObject({ isLoggedIn: false, player: null, token: null, isCaptain: false, requiresVerification: false })
})
it('passes login credentials through and applies the returned profile', async () => {
  mount()
  await emit(null)
  const response = { player: { id: 'p', display_name: 'Logged in' }, requiresVerification: true }
  api.login.mockResolvedValue(response)
  const credentials = { email: 'p@example.test', password: 'fixture' }
  let result
  await act(async () => { result = await context.login(credentials) })
  expect(result).toBe(response)
  expect(api.login).toHaveBeenCalledWith(credentials)
  expect(context.player.display_name).toBe('Logged in')
  // Firebase's auth listener, rather than an API response, establishes the session.
  expect(context.isLoggedIn).toBe(false)
})
it('clears local session even if remote logout fails, while propagating the failure', async () => {
  mount()
  await emit({ uid: 'p', emailVerified: true })
  api.logout.mockRejectedValue(new Error('offline'))
  await act(async () => { await expect(context.logout()).rejects.toThrow('offline') })
  expect(context).toMatchObject({ player: null, token: null, isCaptain: false, isLoggedIn: false })
})
it('unsubscribes from auth on provider unmount', () => {
  const view = mount()
  view.unmount()
  expect(fixture.stop).toHaveBeenCalledOnce()
})
it('reports misuse outside the provider', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try { expect(() => render(<Consumer />)).toThrow('within AuthProvider') }
  finally { log.mockRestore() }
})
