import { auth } from '../lib/firebase'

export async function sendInviteEmail(payload) {
  const user = auth.currentUser
  if (!user) throw new Error('Please sign in to send invites')
  // Project-based, not a toggle: a DEV build must never call the production mailer.
  if (import.meta.env.VITE_FIREBASE_PROJECT_ID === 'pulseiq-dev-70d82') {
    return { ok: true, status: 200, stubbed: true }
  }
  const idToken = await user.getIdToken()
  return fetch('https://admin.pulseiq.com.au/api/send-invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
  })
}
