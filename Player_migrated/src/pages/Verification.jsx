import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { applyActionCode } from 'firebase/auth'
import { doc, updateDoc } from 'firebase/firestore'
import { auth, firestore } from '../lib/firebase'

export default function Verification() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('loading') // loading | success | error | invalid
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const mode = searchParams.get('mode')
    const oobCode = searchParams.get('oobCode')

    if (!oobCode || mode !== 'verifyEmail') {
      setStatus('invalid')
      return
    }

    applyActionCode(auth, oobCode)
      .then(async () => {
        // Mark verified in Firestore if user is logged in
        const user = auth.currentUser
        if (user) {
          try {
            await updateDoc(doc(firestore, 'users', user.uid), {
              emailVerified: true,
            })
          } catch {
            // Non-critical — auth is verified even if Firestore update fails
          }
        }
        setStatus('success')
      })
      .catch((err) => {
        if (err.code === 'auth/invalid-action-code') {
          setErrorMessage('This verification link has already been used or has expired.')
        } else if (err.code === 'auth/expired-action-code') {
          setErrorMessage('This verification link has expired. Please request a new one.')
        } else {
          setErrorMessage(err.message)
        }
        setStatus('error')
      })
  }, [])

  const containerStyle = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f0f0f',
    fontFamily: 'sans-serif',
    padding: '2rem',
  }

  const cardStyle = {
    textAlign: 'center',
    maxWidth: 400,
    width: '100%',
  }

  if (status === 'loading') return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <p style={{ color: '#888', fontSize: '1rem' }}>Verifying your email...</p>
      </div>
    </div>
  )

  if (status === 'success') return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</p>
        <h2 style={{ color: '#fff', fontWeight: 800, marginBottom: '0.5rem' }}>
          Email verified!
        </h2>
        <p style={{ color: '#888', marginBottom: '2rem' }}>
          Your account is now active. You can sign in and start playing.
        </p>
        <Link
          to="/login"
          style={{
            display: 'block', background: '#f97316', color: '#000',
            padding: '0.875rem 1.5rem', borderRadius: 8, fontWeight: 700,
            textDecoration: 'none', fontSize: '1rem',
          }}
        >
          Sign in to PulseIQ
        </Link>
      </div>
    </div>
  )

  if (status === 'error') return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</p>
        <h2 style={{ color: '#fff', fontWeight: 800, marginBottom: '0.5rem' }}>
          Verification failed
        </h2>
        <p style={{ color: '#888', marginBottom: '2rem' }}>
          {errorMessage}
        </p>
        <Link
          to="/login"
          style={{
            display: 'block', background: 'transparent', color: '#f97316',
            padding: '0.875rem 1.5rem', borderRadius: 8, fontWeight: 700,
            textDecoration: 'none', border: '1px solid #f97316',
          }}
        >
          Back to login
        </Link>
      </div>
    </div>
  )

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</p>
        <h2 style={{ color: '#fff', fontWeight: 800, marginBottom: '0.5rem' }}>
          Invalid link
        </h2>
        <p style={{ color: '#888', marginBottom: '2rem' }}>
          This link is not valid. Please use the link from your verification email.
        </p>
        <Link to="/login" style={{ color: '#f97316' }}>Back to login</Link>
      </div>
    </div>
  )
}
