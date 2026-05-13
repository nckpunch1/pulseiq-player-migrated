import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth.jsx'
import './auth.css'

function validate({ email, password }) {
  const errors = {}
  if (!email.trim()) errors.email = 'Email is required'
  if (!password)     errors.password = 'Password is required'
  return errors
}

export default function Login() {
  const { setSessionFromResponse } = useAuth()
  const navigate = useNavigate()

  const [fields, setFields]           = useState({ email: '', password: '' })
  const [errors, setErrors]           = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting]   = useState(false)

  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [resendCooldown, setResendCooldown]             = useState(0)

  const [forgotPassword, setForgotPassword] = useState(false)
  const [resetEmail, setResetEmail]         = useState('')
  const [resetSent, setResetSent]           = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setFields(f => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const handleResend = async () => {
    try {
      await api.resendVerificationEmail()
      setResendCooldown(60)
      const timer = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0 }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      setServerError(err.message)
    }
  }

  const handleReset = async () => {
    if (!resetEmail.trim()) return
    try {
      await api.resetPassword(resetEmail)
      setResetSent(true)
    } catch (err) {
      setServerError(err.message)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate(fields)
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSubmitting(true)
    setServerError('')
    try {
      const data = await api.login({ email: fields.email.trim(), password: fields.password })
      setSessionFromResponse(data)
      if (data.requiresVerification) {
        setAwaitingVerification(true)
        return
      }
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setServerError(err.message ?? 'Login failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (awaitingVerification) return (
    <div className="register-page">
      <div className="register-card">
        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📧</p>
          <h2 style={{ fontWeight: 800, marginBottom: '0.5rem' }}>
            Check your email
          </h2>
          <p style={{ color: '#888', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            We sent a verification link to <strong>{fields.email}</strong>.
            Click the link to activate your account.
          </p>
          {serverError && <p className="auth-server-error">{serverError}</p>}
          <button
            className="register-btn register-btn--primary"
            onClick={handleResend}
            disabled={resendCooldown > 0}
          >
            {resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : 'Resend verification email'}
          </button>
          <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#666' }}>
            Already verified?{' '}
            <a href="/login" style={{ color: '#f97316' }}>Sign in</a>
          </p>
        </div>
      </div>
    </div>
  )

  if (forgotPassword) return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-logo">
          <span className="auth-logo-bolt">⚡</span>
          <span className="auth-logo-name">PULSE</span>
          <span className="auth-logo-iq">IQ</span>
        </p>

        {resetSent ? (
          <div>
            <p>✅ Reset link sent to {resetEmail}</p>
            <p>Check your inbox and follow the link to reset your password.</p>
            <button onClick={() => { setForgotPassword(false); setResetSent(false) }}>
              Back to login
            </button>
          </div>
        ) : (
          <div>
            <h3>Reset your password</h3>
            <p>Enter your email and we&apos;ll send you a reset link.</p>
            {serverError && <p className="auth-server-error">{serverError}</p>}
            <input
              type="email"
              autoComplete="email"
              placeholder="Your email address"
              value={resetEmail}
              onChange={e => setResetEmail(e.target.value)}
              className="auth-input"
              style={{ marginBottom: '0.75rem' }}
            />
            <button onClick={handleReset} className="auth-btn">Send reset link</button>
            <button
              type="button"
              onClick={() => setForgotPassword(false)}
              style={{ background: 'none', border: 'none', color: '#f97316',
                cursor: 'pointer', fontSize: '0.85rem', marginTop: '0.5rem',
                display: 'flex', alignItems: 'center', minHeight: '44px' }}
            >
              Back to login
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-logo">
          <span className="auth-logo-bolt">⚡</span>
          <span className="auth-logo-name">PULSE</span>
          <span className="auth-logo-iq">IQ</span>
        </p>
        <p className="auth-tagline">Test your knowledge. Beat your mates.</p>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your player account</p>

        {serverError && <p className="auth-server-error">{serverError}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-fields">

            <div className="auth-field">
              <label className="auth-label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                className={`auth-input${errors.email ? ' auth-input--error' : ''}`}
                placeholder="Email address"
                value={fields.email}
                onChange={handleChange}
              />
              {errors.email && <span className="auth-field-error">{errors.email}</span>}
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                className={`auth-input${errors.password ? ' auth-input--error' : ''}`}
                placeholder="••••••••"
                value={fields.password}
                onChange={handleChange}
              />
              {errors.password && <span className="auth-field-error">{errors.password}</span>}
              <button
                type="button"
                onClick={() => setForgotPassword(true)}
                style={{ background: 'none', border: 'none', color: '#f97316',
                  cursor: 'pointer', fontSize: '0.85rem', marginTop: '0.5rem',
                  minHeight: '44px', display: 'flex', alignItems: 'center' }}
              >
                Forgot password?
              </button>
            </div>

          </div>

          <button type="submit" className="auth-btn" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  )
}
