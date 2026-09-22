import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const { auth } = vi.hoisted(() => ({ auth: { currentUser: null } }))
vi.mock('../src/lib/firebase', () => ({ auth }))
import { sendInviteEmail } from '../src/api/inviteEmail'
beforeEach(() => {
  auth.currentUser = { getIdToken: vi.fn().mockResolvedValue('test-token') }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
it('DEV simulates an invitation without fetching or obtaining a token', async () => {
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'pulseiq-dev-70d82')
  expect(await sendInviteEmail({ toEmail: 'nobody@example.test' })).toMatchObject({ ok: true, stubbed: true })
  expect(fetch).not.toHaveBeenCalled()
  expect(auth.currentUser.getIdToken).not.toHaveBeenCalled()
})
it('production keeps the authenticated invitation contract', async () => {
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'pulseiqadmin')
  const payload = { toEmail: 'nobody@example.test', teamId: 'a' }
  await sendInviteEmail(payload)
  expect(fetch).toHaveBeenCalledWith('https://admin.pulseiq.com.au/api/send-invite', expect.objectContaining({ body: JSON.stringify(payload), headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }))
})
it('does not pretend an unauthenticated DEV invitation succeeded', async () => {
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'pulseiq-dev-70d82')
  auth.currentUser = null
  await expect(sendInviteEmail({})).rejects.toThrow('sign in')
  expect(fetch).not.toHaveBeenCalled()
})
