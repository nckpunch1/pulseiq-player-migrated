import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
} from 'firebase/auth'
import { auth } from '../api/firebaseClient'

export default function AuthAction() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const mode = searchParams.get('mode')
  const oobCode = searchParams.get('oobCode')

  // Password reset state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!oobCode) {
      setError('Invalid link.')
      setVerifying(false)
      return
    }

    if (mode === 'verifyEmail') {
      applyActionCode(auth, oobCode)
        .then(() => {
          setDone(true)
          setVerifying(false)
          setTimeout(() => navigate('/'), 3000)
        })
        .catch(() => {
          setError(
            'This verification link has expired or ' +
            'already been used.'
          )
          setVerifying(false)
        })
      return
    }

    if (mode === 'resetPassword') {
      verifyPasswordResetCode(auth, oobCode)
        .then(email => {
          setEmail(email)
          setVerifying(false)
        })
        .catch(() => {
          setError(
            'This reset link has expired or ' +
            'already been used.'
          )
          setVerifying(false)
        })
      return
    }

    // Unknown mode
    navigate('/')
  }, [mode, oobCode])

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
      setError(
        'Failed to reset password. ' +
        'The link may have expired.'
      )
    }
    setLoading(false)
  }

  const containerStyle = {
    minHeight: '100vh',
    background: '#0f0f0f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
  }

  const cardStyle = {
    width: '100%',
    maxWidth: 400,
    background: '#1a1a1a',
    borderRadius: 16,
    padding: '2rem',
    border: '1px solid #2a2a2a',
  }

  const inputStyle = {
    width: '100%',
    background: '#111',
    border: '1px solid #333',
    borderRadius: 10,
    padding: '0.75rem 1rem',
    color: '#fff',
    fontSize: '1rem',
    boxSizing: 'border-box',
    marginBottom: '0.75rem',
  }

  const buttonStyle = {
    width: '100%',
    background: '#f97316',
    color: '#000',
    border: 'none',
    borderRadius: 10,
    padding: '0.75rem',
    fontWeight: 800,
    fontSize: '1rem',
    cursor: 'pointer',
    marginTop: '0.5rem',
  }

  if (verifying) return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <p style={{ color: '#fff' }}>
          Verifying link...
        </p>
      </div>
    </div>
  )

  // Email verification result
  if (mode === 'verifyEmail') return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <p style={{
          color: '#f97316', fontWeight: 900,
          fontSize: '1.4rem', marginBottom: '1rem',
        }}>
          PULSE<span style={{ color: '#fff' }}>IQ</span>
        </p>
        {done ? (
          <>
            <p style={{
              color: '#4ade80', fontWeight: 700,
              marginBottom: '0.5rem',
            }}>
              ✓ Email verified successfully
            </p>
            <p style={{ color: '#888', fontSize: '0.85rem' }}>
              Redirecting you to the app...
            </p>
          </>
        ) : (
          <>
            <p style={{
              color: '#f87171', marginBottom: '1rem'
            }}>
              {error}
            </p>
            <button
              onClick={() => navigate('/')}
              style={buttonStyle}
            >
              Go to App
            </button>
          </>
        )}
      </div>
    </div>
  )

  // Password reset form
  if (mode === 'resetPassword') return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <p style={{
          color: '#f97316', fontWeight: 900,
          fontSize: '1.4rem', marginBottom: '0.5rem',
        }}>
          PULSE<span style={{ color: '#fff' }}>IQ</span>
        </p>
        <p style={{
          color: '#fff', fontWeight: 700,
          fontSize: '1.1rem', marginBottom: '0.5rem',
        }}>
          Reset Password
        </p>

        {email && !done && (
          <p style={{
            color: '#888', fontSize: '0.85rem',
            marginBottom: '1.5rem',
          }}>
            Setting new password for {email}
          </p>
        )}

        {done ? (
          <>
            <p style={{
              color: '#4ade80', marginBottom: '0.5rem'
            }}>
              ✓ Password reset successfully
            </p>
            <p style={{ color: '#888', fontSize: '0.85rem' }}>
              Redirecting to login...
            </p>
          </>
        ) : error && !email ? (
          <>
            <p style={{
              color: '#f87171', marginBottom: '1rem'
            }}>
              {error}
            </p>
            <button
              onClick={() => navigate('/login')}
              style={buttonStyle}
            >
              Back to Login
            </button>
          </>
        ) : (
          <>
            {error && (
              <p style={{
                color: '#f87171', fontSize: '0.85rem',
                marginBottom: '0.75rem',
              }}>
                {error}
              </p>
            )}
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              style={inputStyle}
            />
            <button
              onClick={handleReset}
              disabled={loading}
              style={{
                ...buttonStyle,
                opacity: loading ? 0.6 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </>
        )}
      </div>
    </div>
  )

  return null
}
