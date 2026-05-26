import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  verifyPasswordResetCode,
  confirmPasswordReset
} from 'firebase/auth'
import { auth } from '../lib/firebase'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const oobCode = searchParams.get('oobCode')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!oobCode) {
      setError('Invalid reset link.')
      setVerifying(false)
      return
    }
    verifyPasswordResetCode(auth, oobCode)
      .then(email => {
        setEmail(email)
        setVerifying(false)
      })
      .catch(() => {
        setError('This reset link has expired or already been used.')
        setVerifying(false)
      })
  }, [oobCode])

  const handleReset = async () => {
    if (!password) return
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await confirmPasswordReset(auth, oobCode, password)
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (e) {
      setError('Failed to reset password. The link may have expired.')
    }
    setLoading(false)
  }

  if (verifying) return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#0f0f0f', color: '#fff'
    }}>
      <p>Verifying reset link...</p>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', background: '#0f0f0f',
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '1.5rem',
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#1a1a1a', borderRadius: 16,
        padding: '2rem', border: '1px solid #2a2a2a',
      }}>
        <p style={{
          color: '#f97316', fontWeight: 900,
          fontSize: '1.4rem', marginBottom: '0.5rem',
        }}>
          Reset Password
        </p>

        {email && !done && (
          <p style={{
            color: '#888', fontSize: '0.85rem',
            marginBottom: '1.5rem'
          }}>
            Setting new password for {email}
          </p>
        )}

        {done ? (
          <div>
            <p style={{ color: '#4ade80', marginBottom: '0.5rem' }}>
              ✓ Password reset successfully
            </p>
            <p style={{ color: '#888', fontSize: '0.85rem' }}>
              Redirecting to login...
            </p>
          </div>
        ) : error && !email ? (
          <div>
            <p style={{ color: '#f87171', marginBottom: '1rem' }}>
              {error}
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{
                width: '100%', background: '#f97316',
                color: '#000', border: 'none',
                borderRadius: 10, padding: '0.75rem',
                fontWeight: 800, cursor: 'pointer',
              }}
            >
              Back to Login
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && (
              <p style={{ color: '#f87171', fontSize: '0.85rem' }}>
                {error}
              </p>
            )}
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                background: '#111', border: '1px solid #333',
                borderRadius: 10, padding: '0.75rem 1rem',
                color: '#fff', fontSize: '1rem', width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              style={{
                background: '#111', border: '1px solid #333',
                borderRadius: 10, padding: '0.75rem 1rem',
                color: '#fff', fontSize: '1rem', width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={handleReset}
              disabled={loading}
              style={{
                width: '100%', background: '#f97316',
                color: '#000', border: 'none',
                borderRadius: 10, padding: '0.75rem',
                fontWeight: 800, cursor: loading
                  ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontSize: '1rem',
              }}
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
