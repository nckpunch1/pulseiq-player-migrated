/**
 * Central API client for QuizPulse Player PWA.
 *
 * All API calls in the app go through this module only.
 * Never call fetch() directly in components or hooks.
 *
 * Automatically switches between mock and real API
 * based on VITE_USE_MOCK_API environment variable.
 */

import { mockApi } from './mock'

const BASE_URL = import.meta.env.VITE_BASE44_API_BASE_URL
const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true'

// ─── Session storage ──────────────────────────────────────────────────────────

const SESSION_KEY = 'quizpulse_player_session_v2'

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSession(data) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

export function getToken() {
  return getSession()?.player_session_token ?? null
}

// ─── Typed API errors ─────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

// ─── Real API client ──────────────────────────────────────────────────────────

const realApi = {
  async post(endpoint, body = {}) {
    if (!BASE_URL) {
      throw new ApiError('CONFIG_ERROR', 'VITE_BASE44_API_BASE_URL is not set.')
    }

    const url = `${BASE_URL}/${endpoint}`

    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (err) {
      throw new ApiError('NETWORK_ERROR', 'Could not reach the server. Check your connection.')
    }

    let json
    try {
      json = await res.json()
    } catch {
      throw new ApiError('PARSE_ERROR', 'Unexpected response from server.')
    }

    if (import.meta.env.DEV) {
      console.log(`[API] ${endpoint} → ${res.status}`, json.success ? 'ok' : json.error?.code)
    }

    if (!json.success) {
      if (json.error?.code === 'UNAUTHORIZED') {
        clearSession()
        window.location.href = '/login'
      }
      throw new ApiError(
        json.error?.code ?? 'UNKNOWN_ERROR',
        json.error?.message ?? 'Something went wrong.'
      )
    }

    return json
  },
}

// ─── Active client (mock or real) ────────────────────────────────────────────

const activeClient = USE_MOCK ? mockApi : realApi

// ─── Wrapped API with auto-token injection ────────────────────────────────────

/**
 * Make an API call. Token is automatically injected if available.
 *
 * @param {string} endpoint - Base44 function name e.g. 'externalPlayerLogin'
 * @param {object} body - Request body
 * @returns {Promise<object>} - The data field from the success response
 */
export async function apiPost(endpoint, body = {}) {
  const token = getToken()

  const fullBody = token
    ? { player_session_token: token, ...body }
    : body

  const response = await activeClient.post(endpoint, fullBody)

  // If mock throws as object rather than ApiError, normalise it
  if (response && response.success === false) {
    throw new ApiError(
      response.error?.code ?? 'UNKNOWN_ERROR',
      response.error?.message ?? 'Something went wrong.'
    )
  }

  return response.data
}

// ─── Named endpoint helpers ───────────────────────────────────────────────────
// These are the only functions components/hooks should call.

export const api = {
  // Auth
  login: (body) => apiPost('externalPlayerLogin', body),
  register: (body) => apiPost('externalPlayerRegister', body),
  me: () => apiPost('externalPlayerMe'),
  logout: () => apiPost('externalPlayerLogout'),

  // Dashboard
  dashboard: () => apiPost('externalPlayerDashboard'),

  // Team
  getTeam: () => apiPost('externalPlayerGetTeam'),
  createTeam: (teamName) => apiPost('externalPlayerCreateTeam', { team_name: teamName }),
  searchTeams: (query) => apiPost('externalPlayerSearchTeams', { query }),
  requestToJoin: (teamId) => apiPost('externalPlayerRequestToJoinTeam', { team_id: teamId }),
  getJoinRequests: (teamId) => apiPost('externalPlayerGetTeamJoinRequests', { team_id: teamId }),
  handleJoinRequest: (requestId, action) => apiPost('externalPlayerHandleJoinRequest', { request_id: requestId, action }),
  leaveTeam: (teamId) => apiPost('externalPlayerLeaveTeam', { team_id: teamId }),

  // Games
  getGames: () => apiPost('externalPlayerGetGames'),
  getGameDetails: (gameId) => apiPost('externalPlayerGetGameDetails', { game_id: gameId }),
  registerForGame: (gameId, teamSize) => apiPost('externalPlayerRegisterTeamForGame', { game_id: gameId, team_size: teamSize }),
  confirmAttendance: (gameId, confirmedTeamSize) => apiPost('externalPlayerConfirmAttendance', { game_id: gameId, confirmed_team_size: confirmedTeamSize }),

  // Leaderboard
  getLeaderboards: () => apiPost('externalPlayerGetLeaderboards'),
}
