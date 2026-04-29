import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import Login     from './pages/Login.jsx'
import Register  from './pages/Register.jsx'
import Dashboard   from './pages/Dashboard.jsx'
import Team        from './pages/Team.jsx'
import Games       from './pages/Games.jsx'
import GameDetail    from './pages/GameDetail.jsx'
import Leaderboard  from './pages/Leaderboard.jsx'
import BottomNav        from './components/BottomNav.jsx'
import MiniGameOverlay  from './components/MiniGameOverlay.jsx'

// ─── Route guards ─────────────────────────────────────────────────────────────

function ProtectedRoute() {
  const { isLoggedIn } = useAuth()
  if (!isLoggedIn) return <Navigate to="/login" replace />
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
            <Route path="/leaderboard" element={<Leaderboard />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
