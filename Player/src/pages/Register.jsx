import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth.jsx'
import './auth.css'

function validate({ firstName, lastName, username, password, confirmPassword }) {
  const errors = {}
  if (!firstName.trim()) errors.firstName = 'Required'
  if (!lastName.trim())  errors.lastName  = 'Required'
  if (!username.trim())               errors.username = 'Username is required'
  else if (username.trim().length < 3) errors.username = 'At least 3 characters'
  if (!password)               errors.password = 'Password is required'
  else if (password.length < 8) errors.password = 'At least 8 characters'
  if (!confirmPassword)                     errors.confirmPassword = 'Please confirm your password'
  else if (password !== confirmPassword)    errors.confirmPassword = "Passwords don't match"
  return errors
}

export default function Register() {
  const { setSessionFromResponse } = useAuth()
  const navigate = useNavigate()

  const [fields, setFields] = useState({
    firstName: '', lastName: '', username: '', password: '', confirmPassword: '',
  })
  const [errors, setErrors]           = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting]   = useState(false)

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
      const data = await api.register({
        first_name: fields.firstName.trim(),
        last_name:  fields.lastName.trim(),
        username:   fields.username.trim(),
        password:   fields.password,
      })
      setSessionFromResponse(data)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setServerError(err.message ?? 'Registration failed. Please try again.')
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
              <label className="auth-label" htmlFor="reg-username">Username</label>
              <input
                id="reg-username"
                name="username"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                className={`auth-input${errors.username ? ' auth-input--error' : ''}`}
                placeholder="Choose a username"
                value={fields.username}
                onChange={handleChange}
              />
              {errors.username && <span className="auth-field-error">{errors.username}</span>}
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
