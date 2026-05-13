import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth.jsx'
import './auth.css'

function validate({ firstName, lastName, email, password, confirmPassword }) {
  const errors = {}
  if (!firstName.trim()) errors.firstName = 'Required'
  if (!lastName.trim())  errors.lastName  = 'Required'
  if (!email.trim())                   errors.email = 'Email is required'
  else if (!/\S+@\S+\.\S+/.test(email)) errors.email = 'Enter a valid email address'
  if (!password)               errors.password = 'Password is required'
  else if (password.length < 8) errors.password = 'At least 8 characters'
  if (!confirmPassword)                  errors.confirmPassword = 'Please confirm your password'
  else if (password !== confirmPassword) errors.confirmPassword = "Passwords don't match"
  return errors
}

export default function Register() {
  const { setSessionFromResponse } = useAuth()
  const navigate = useNavigate()

  const [fields, setFields] = useState({
    firstName: '', lastName: '', email: '', password: '', confirmPassword: '',
  })
  const [errors, setErrors]                   = useState({})
  const [serverError, setServerError]         = useState('')
  const [submitting, setSubmitting]           = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [resendCooldown, setResendCooldown]   = useState(0)

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

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate(fields)
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSubmitting(true)
    setServerError('')
    try {
      const data = await api.register({
        first_name: fields.firstName.trim(),
        last_name:  fields.lastName.trim(),
        email:      fields.email.trim(),
        password:   fields.password,
      })
      if (data.requiresVerification) {
        setSessionFromResponse(data)
        setAwaitingVerification(true)
        return
      }
      setSessionFromResponse(data)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setServerError(err.message ?? 'Registration failed. Please try again.')
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

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-logo">
          <span className="auth-logo-bolt">⚡</span>
          <span className="auth-logo-name">QUIZPULSE </span>
          <span className="auth-logo-iq">IQ</span>
        </p>
        <p className="auth-tagline">Test your knowledge. Beat your mates.</p>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-subtitle">Join the QuizPulse player portal</p>

        {serverError && <p className="auth-server-error">{serverError}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-fields">

            <div className="auth-row">
              <div className="auth-field">
                <label className="auth-label" htmlFor="reg-firstName">First name</label>
                <input
                  id="reg-firstName"
                  name="firstName"
                  type="text"
                  autoComplete="off"
                  className={`auth-input${errors.firstName ? ' auth-input--error' : ''}`}
                  placeholder="First name"
                  value={fields.firstName}
                  onChange={handleChange}
                />
                {errors.firstName && <span className="auth-field-error">{errors.firstName}</span>}
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="reg-lastName">Last name</label>
                <input
                  id="reg-lastName"
                  name="lastName"
                  type="text"
                  autoComplete="off"
                  className={`auth-input${errors.lastName ? ' auth-input--error' : ''}`}
                  placeholder="Last name"
                  value={fields.lastName}
                  onChange={handleChange}
                />
                {errors.lastName && <span className="auth-field-error">{errors.lastName}</span>}
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                name="email"
                type="email"
                autoComplete="email"
                className={`auth-input${errors.email ? ' auth-input--error' : ''}`}
                placeholder="you@example.com"
                value={fields.email}
                onChange={handleChange}
              />
              {errors.email && <span className="auth-field-error">{errors.email}</span>}
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                name="password"
                type="password"
                autoComplete="new-password"
                className={`auth-input${errors.password ? ' auth-input--error' : ''}`}
                placeholder="Min. 8 characters"
                value={fields.password}
                onChange={handleChange}
              />
              {errors.password && <span className="auth-field-error">{errors.password}</span>}
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="reg-confirmPassword">Confirm password</label>
              <input
                id="reg-confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                className={`auth-input${errors.confirmPassword ? ' auth-input--error' : ''}`}
                placeholder="••••••••"
                value={fields.confirmPassword}
                onChange={handleChange}
              />
              {errors.confirmPassword && <span className="auth-field-error">{errors.confirmPassword}</span>}
            </div>

          </div>

          <button type="submit" className="auth-btn" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
