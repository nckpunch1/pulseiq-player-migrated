import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import BottomNav       from './components/BottomNav.jsx'
import MiniGameOverlay from './components/MiniGameOverlay.jsx'

// Page-level code splitting — each route becomes its own chunk.
// BottomNav and MiniGameOverlay are kept static: they mount immediately
// on every protected page and lazy-loading them would cause a visible flash.
const Login        = lazy(() => import('./pages/Login.jsx'))
const Register     = lazy(() => import('./pages/Register.jsx'))
const VerifyPending = lazy(() => import('./pages/VerifyPending.jsx'))
const Dashboard    = lazy(() => import('./pages/Dashboard.jsx'))
const Team         = lazy(() => import('./pages/Team.jsx'))
const Games        = lazy(() => import('./pages/Games.jsx'))
const GameDetail   = lazy(() => import('./pages/GameDetail.jsx'))
const LiveGame     = lazy(() => import('./pages/LiveGame.jsx'))
const Leaderboard  = lazy(() => import('./pages/Leaderboard.jsx'))
const Profile      = lazy(() => import('./pages/Profile.jsx'))

const pageFallback = (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Loading…</p>
  </div>
)

// ─── Route guards ─────────────────────────────────────────────────────────────

function ProtectedRoute() {
  const { player, requiresVerification, loading } = useAuth()
  if (loading) return null
  if (!player) return <Navigate to="/login" replace />
  if (requiresVerification) return <Navigate to="/verify-pending" replace />
  return (
    <>
      <MiniGameOverlay />
      <Outlet />
      <BottomNav />
    </>
  )
}

function GuestOnlyRoute() {
  const { isLoggedIn } = useAuth()
  return isLoggedIn ? <Navigate to="/dashboard" replace /> : <Outlet />
}


// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={pageFallback}>
          <Routes>
            <Route element={<GuestOnlyRoute />}>
              <Route path="/login"    element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard"  element={<Dashboard />} />
              <Route path="/team"       element={<Team />} />
              <Route path="/games"      element={<Games />} />
              <Route path="/games/:id"  element={<GameDetail />} />
              <Route path="/games/:gameId/live" element={<LiveGame />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/profile"    element={<Profile />} />
            </Route>

            <Route path="/verify-pending" element={<VerifyPending />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
