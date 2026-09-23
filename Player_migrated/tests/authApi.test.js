import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ auth: { currentUser: null }, data: {}, exists: true }))
vi.mock('../src/lib/firebase', () => ({ auth: fixture.auth, firestore: {}, db: {} }))
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(), createUserWithEmailAndPassword: vi.fn(), deleteUser: vi.fn(),
  sendEmailVerification: vi.fn(), sendPasswordResetEmail: vi.fn(), signOut: vi.fn(),
}))
vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn() }))
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => parts.join('/'), getDoc: vi.fn(async () => ({ exists: () => fixture.exists, data: () => fixture.data })),
  updateDoc: vi.fn(), setDoc: vi.fn(), serverTimestamp: () => 'TIME',
  collection: vi.fn(), collectionGroup: vi.fn(), getDocs: vi.fn(), deleteDoc: vi.fn(), writeBatch: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(),
}))
import * as authSdk from 'firebase/auth'
import { updateDoc, setDoc } from 'firebase/firestore'
import { login, register, me, resetPassword, resendVerificationEmail, getTeamId, getTeam } from '../src/api/firebaseClient'
import { clear } from '../src/api/cache'
beforeEach(() => {
  vi.resetAllMocks(); clear()
  fixture.auth.currentUser = { uid: 'p' }
  fixture.data = { email: 'p@example.test', displayName: 'Profile name', emailVerified: true }
  fixture.exists = true
  authSdk.signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'p', emailVerified: true } })
  authSdk.createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'p' } })
  authSdk.deleteUser.mockResolvedValue()
})
afterEach(clear)
it('normalizes login email, preserves password and avoids redundant verification writes', async () => {
  const result = await login({ email: ' P@EXAMPLE.TEST ', password: ' password ' })
  expect(authSdk.signInWithEmailAndPassword).toHaveBeenCalledWith(fixture.auth, 'p@example.test', ' password ')
  expect(result.player).toMatchObject({ id: 'p', display_name: 'Profile name' })
  expect(updateDoc).not.toHaveBeenCalled()
})
it('syncs a newly verified Firebase identity to its own profile', async () => {
  fixture.data.emailVerified = false
  await login({ email: 'p@example.test', password: 'fixture' })
  expect(updateDoc).toHaveBeenCalledWith('users/p', { emailVerified: true })
})
it('unverified login returns verification-required without writing profile flags', async () => {
  authSdk.signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'p', emailVerified: false } })
  fixture.data = { emailVerified: false }
  expect(await login({ email: 'p@example.test', password: 'fixture' })).toMatchObject({ requiresVerification: true })
  expect(updateDoc).not.toHaveBeenCalled()
})
it.each([
  ['auth/user-not-found', 'INVALID_CREDENTIALS'], ['auth/invalid-credential', 'INVALID_CREDENTIALS'],
  ['auth/wrong-password', 'INVALID_CREDENTIALS'], ['auth/email-already-in-use', 'EMAIL_TAKEN'],
  ['auth/invalid-email', 'INVALID_EMAIL'], ['auth/weak-password', 'WEAK_PASSWORD'], ['auth/network-request-failed', 'AUTH_ERROR'],
])('maps %s without attempting profile writes', async (code, expected) => {
  authSdk.signInWithEmailAndPassword.mockRejectedValue({ code, message: 'Failure' })
  await expect(login({ email: 'p@example.test', password: 'fixture' })).rejects.toMatchObject({ name: 'ApiError', code: expected })
  expect(updateDoc).not.toHaveBeenCalled()
})
it('never persists the signup password and sends verification only after storing the profile', async () => {
  const result = await register({ first_name: 'First', last_name: 'Last', email: ' P@EXAMPLE.TEST ', password: 'secret-fixture', region_id: 'bne-id' })
  const [path, record] = setDoc.mock.calls[0]
  expect(path).toBe('users/p')
  expect(record).toMatchObject({ email: 'p@example.test', displayName: 'First Last', role: 'player', teamId: null, manuallyVerified: false, regions: ['bne-id'] })
  expect(record).not.toHaveProperty('password')
  expect(setDoc.mock.invocationCallOrder[0]).toBeLessThan(authSdk.sendEmailVerification.mock.invocationCallOrder[0])
  expect(result.requiresVerification).toBe(true)
})
it('does not send verification if profile creation fails', async () => {
  setDoc.mockRejectedValueOnce(new Error('profile unavailable'))
  await expect(register({ first_name: 'F', last_name: 'L', email: 'p@example.test', password: 'fixture', region_id: 'bne-id' })).rejects.toMatchObject({ code: 'AUTH_ERROR' })
  expect(authSdk.sendEmailVerification).not.toHaveBeenCalled()
  // The profile-less auth account is removed so the email can sign up again.
  expect(authSdk.deleteUser).toHaveBeenCalledWith({ uid: 'p' })
})
it.each([undefined, '', null, 7, ['bne-id'], 'bne-id/x'])('signup without a single region ID (%j) is rejected before any account is created', async region_id => {
  await expect(register({ first_name: 'F', last_name: 'L', email: 'p@example.test', password: 'fixture', region_id })).rejects.toMatchObject({ name: 'ApiError', code: 'REGION_REQUIRED' })
  expect(authSdk.createUserWithEmailAndPassword).not.toHaveBeenCalled()
  expect(setDoc).not.toHaveBeenCalled()
})
it('signup with a nonexistent region stores no profile and removes the new auth account', async () => {
  fixture.exists = false
  await expect(register({ first_name: 'F', last_name: 'L', email: 'p@example.test', password: 'fixture', region_id: 'nowhere' })).rejects.toMatchObject({ code: 'REGION_NOT_FOUND' })
  expect(setDoc).not.toHaveBeenCalled()
  expect(authSdk.deleteUser).toHaveBeenCalledWith({ uid: 'p' })
  expect(authSdk.sendEmailVerification).not.toHaveBeenCalled()
})
it('an auth failure at signup maps as before and deletes nothing', async () => {
  authSdk.createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' })
  await expect(register({ first_name: 'F', last_name: 'L', email: 'p@example.test', password: 'fixture', region_id: 'bne-id' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' })
  expect(authSdk.deleteUser).not.toHaveBeenCalled()
})
it.each([me, getTeamId, getTeam, resendVerificationEmail])('rejects protected operations without an authenticated user', async invoke => {
  fixture.auth.currentUser = null
  await expect(invoke()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
})
it('returns a safe empty profile for a missing user record', async () => {
  fixture.exists = false
  expect(await me()).toMatchObject({ player: { id: 'p', email: null, display_name: '' } })
})
it('maps password-reset errors and sends normalized email', async () => {
  authSdk.sendPasswordResetEmail.mockRejectedValueOnce({ code: 'auth/invalid-email' })
  await expect(resetPassword(' BAD@EMAIL ')).rejects.toMatchObject({ code: 'INVALID_EMAIL' })
  expect(authSdk.sendPasswordResetEmail).toHaveBeenCalledWith(fixture.auth, 'bad@email')
})
