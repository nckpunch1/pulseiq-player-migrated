import { useState } from 'react'
import { api } from '../api/client'

export default function VerifyPending() {
  const [resendCooldown, setResendCooldown] = useState(0)
  const [message, setMessage] = useState('')

  const handleResend = async () => {
    try {
      await api.resendVerificationEmail()
      setMessage('Verification email sent!')
      setResendCooldown(60)
      const timer = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0 }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      setMessage(err.message)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#0f0f0f', fontFamily: 'sans-serif', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <p style={{ fontSize: '3rem' }}>📧</p>
        <h2 style={{ color: '#fff', fontWeight: 800, marginBottom: '0.5rem' }}>
          Verify your email
        </h2>
        <p style={{ color: '#888', marginBottom: '1.5rem' }}>
          Check your inbox for a verification link before you can access PulseIQ.
          If you&apos;ve already clicked the link, try logging in again.
        </p>
        {message && (
          <p style={{ color: '#f97316', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {message}
          </p>
        )}
        <button
          onClick={handleResend}
          disabled={resendCooldown > 0}
          style={{ background: '#f97316', color: '#000', border: 'none',
            borderRadius: 8, padding: '0.75rem 1.5rem', fontWeight: 700,
            cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
            opacity: resendCooldown > 0 ? 0.6 : 1, width: '100%',
            marginBottom: '1rem' }}
        >
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification email'}
        </button>
        <a href="/login" style={{ color: '#666', fontSize: '0.85rem' }}>
          Back to login
        </a>
      </div>
    </div>
  )
}
