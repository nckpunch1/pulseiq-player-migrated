import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth.jsx'
import './auth.css'

function validate({ username, password }) {
  const errors = {}
  if (!username.trim()) errors.username = 'Username is required'
  if (!password)        errors.password = 'Password is required'
  return errors
}

export default function Login() {
  const { setSessionFromResponse } = useAuth()
  const navigate = useNavigate()

  const [fields, setFields]         = useState({ username: '', password: '' })
  const [errors, setErrors]         = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setFields(f => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate(fields)
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSubmitting(true)
    setServerError('')
    try {
      const data = await api.login({ username: fields.username.trim(), password: fields.password })
      setSessionFromResponse(data)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setServerError(err.message ?? 'Login failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-logo">
          <span className="auth-logo-bolt">⚡</span>
          <span className="auth-logo-name">QUIZPULSE </span>
          <span className="auth-logo-iq">IQ</span>
        </p>
        <p className="auth-tagline">Test your knowledge. Beat your mates.</p>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your player account</p>

        {serverError && <p className="auth-server-error">{serverError}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-fields">

            <div className="auth-field">
              <label className="auth-label" htmlFor="login-username">Username</label>
              <input
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                className={`auth-input${errors.username ? ' auth-input--error' : ''}`}
                placeholder="your_username"
                value={fields.username}
                onChange={handleChange}
              />
              {errors.username && <span className="auth-field-error">{errors.username}</span>}
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
