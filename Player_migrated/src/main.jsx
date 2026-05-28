import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) return (
      <div style={{
        padding: '2rem', color: '#fff',
        background: '#0f0f0f', minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ color: '#f97316', fontWeight: 900, fontSize: '1.5rem', marginBottom: '1rem' }}>
          Something went wrong
        </p>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          {this.state.error?.message}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ background: '#f97316', color: '#000', border: 'none', borderRadius: 8, padding: '0.75rem 1.5rem', fontWeight: 800, cursor: 'pointer' }}
        >
          Reload
        </button>
      </div>
    )
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
