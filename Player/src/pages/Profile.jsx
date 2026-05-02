import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, firestore } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth.jsx'
import './profile.css'

export default function Profile() {
  const { player, setSessionFromResponse } = useAuth()

  const [displayName, setDisplayName] = useState(player?.display_name ?? '')
  const [nameSuccess, setNameSuccess] = useState('')
  const [nameError, setNameError]     = useState('')
  const [savingName, setSavingName]   = useState(false)

  const [currentPw, setCurrentPw]   = useState('')
  const [newPw, setNewPw]           = useState('')
  const [confirmPw, setConfirmPw]   = useState('')
  const [pwSuccess, setPwSuccess]   = useState('')
  const [pwError, setPwError]       = useState('')
  const [savingPw, setSavingPw]     = useState(false)

  async function handleSaveName(e) {
    e.preventDefault()
    const trimmed = displayName.trim()
    if (!trimmed) { setNameError('Display name is required'); return }
    setSavingName(true)
    setNameError('')
    setNameSuccess('')
    try {
      const user = auth.currentUser
      if (user) {
        await updateProfile(user, { displayName: trimmed })
      }
      const userId = player?.id ?? player?.user_id
      if (userId) {
        await setDoc(doc(firestore, 'users', String(userId)), { display_name: trimmed }, { merge: true })
      }
      setSessionFromResponse({ player: { ...player, display_name: trimmed } })
      setNameSuccess('Display name updated.')
    } catch (err) {
      setNameError(err.message ?? 'Failed to update display name.')
    } finally {
      setSavingName(false)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (!currentPw)            { setPwError('Current password is required'); return }
    if (!newPw)                { setPwError('New password is required'); return }
    if (newPw.length < 8)      { setPwError('Password must be at least 8 characters'); return }
    if (newPw !== confirmPw)   { setPwError("Passwords don't match"); return }
    setSavingPw(true)
    setPwError('')
    setPwSuccess('')
    try {
      const user = auth.currentUser
      if (!user) throw new Error('No active session — please log out and log in again.')
      const credential = EmailAuthProvider.credential(user.email, currentPw)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPw)
      setPwSuccess('Password updated successfully.')
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      const code = err.code ?? ''
      const msg =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Current password is incorrect.'
          : code === 'auth/weak-password'
          ? 'Password is too weak. Choose a stronger one.'
          : code === 'auth/requires-recent-login'
          ? 'Session expired — log out and log in again before changing your password.'
          : err.message ?? 'Failed to change password.'
      setPwError(msg)
    } finally {
      setSavingPw(false)
    }
  }

  const email = auth.currentUser?.email ?? player?.email ?? null

  return (
    <div className="profile-page">

      <header className="profile-header">
        <Link to="/dashboard" className="profile-back">← Dashboard</Link>
        <p className="profile-wordmark">QuizPulse</p>
        <h1 className="profile-title">Profile</h1>
      </header>

      <div className="profile-body">

        <section className="profile-section">
          <h2 className="profile-section-heading">Account</h2>
          <div className="profile-field-group">
            <label className="profile-label">Email</label>
            <p className="profile-email-value">{email ?? '—'}</p>
          </div>
          {player?.username && (
            <div className="profile-field-group">
              <label className="profile-label">Username</label>
              <p className="profile-email-value">@{player.username}</p>
            </div>
          )}
        </section>

        <section className="profile-section">
          <h2 className="profile-section-heading">Display Name</h2>
          <form onSubmit={handleSaveName} noValidate>
            {nameSuccess && <p className="profile-success">{nameSuccess}</p>}
            {nameError   && <p className="profile-error">{nameError}</p>}
            <div className="profile-field-group">
              <label className="profile-label" htmlFor="prof-displayName">Display name</label>
              <input
                id="prof-displayName"
                type="text"
                autoComplete="off"
                className="profile-input"
                value={displayName}
                onChange={e => { setDisplayName(e.target.value); setNameError(''); setNameSuccess('') }}
              />
            </div>
            <button type="submit" className="profile-btn" disabled={savingName}>
              {savingName ? 'Saving…' : 'Save Name'}
            </button>
          </form>
        </section>

        <section className="profile-section">
          <h2 className="profile-section-heading">Change Password</h2>
          <form onSubmit={handleChangePassword} noValidate>
            {pwSuccess && <p className="profile-success">{pwSuccess}</p>}
            {pwError   && <p className="profile-error">{pwError}</p>}
            <div className="profile-fields">
              <div className="profile-field-group">
                <label className="profile-label" htmlFor="prof-currentPw">Current password</label>
                <input
                  id="prof-currentPw"
                  type="password"
                  autoComplete="current-password"
                  className="profile-input"
                  value={currentPw}
                  onChange={e => { setCurrentPw(e.target.value); setPwError(''); setPwSuccess('') }}
                />
              </div>
              <div className="profile-field-group">
                <label className="profile-label" htmlFor="prof-newPw">New password</label>
                <input
                  id="prof-newPw"
                  type="password"
                  autoComplete="new-password"
                  className="profile-input"
                  value={newPw}
                  onChange={e => { setNewPw(e.target.value); setPwError(''); setPwSuccess('') }}
                />
              </div>
              <div className="profile-field-group">
                <label className="profile-label" htmlFor="prof-confirmPw">Confirm new password</label>
                <input
                  id="prof-confirmPw"
                  type="password"
                  autoComplete="new-password"
                  className="profile-input"
                  value={confirmPw}
                  onChange={e => { setConfirmPw(e.target.value); setPwError(''); setPwSuccess('') }}
                />
              </div>
            </div>
            <button type="submit" className="profile-btn" disabled={savingPw}>
              {savingPw ? 'Updating…' : 'Change Password'}
            </button>
          </form>
        </section>

      </div>
    </div>
  )
}
