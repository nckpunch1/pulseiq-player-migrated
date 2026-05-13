/**
 * Central API client for PulseIQ Player PWA.
 *
 * All API calls in the app go through this module only.
 * Delegates to Firebase service functions in firebaseClient.js.
 */

export { ApiError } from './firebaseClient'

import {
  login,
  register,
  me,
  logout,
  resendVerificationEmail,
  resetPassword,
  dashboard,
  getTeam,
  createTeam,
  searchTeams,
  requestToJoin,
  getJoinRequests,
  handleJoinRequest,
  leaveTeam,
  getGames,
  getGameDetails,
  registerForGame,
  confirmAttendance,
  cancelRegistration,
  getPaperLiveState,
  getLeaderboards,
} from './firebaseClient'

export const api = {
  // Auth
  login,
  register,
  me,
  logout,
  resendVerificationEmail,
  resetPassword: (email) => resetPassword(email),

  // Dashboard
  dashboard,

  // Team
  getTeam,
  createTeam: (teamName) => createTeam(teamName),
  searchTeams: (query) => searchTeams(query),
  requestToJoin: (teamId) => requestToJoin(teamId),
  getJoinRequests: (teamId) => getJoinRequests(teamId),
  handleJoinRequest: (memberId, action) => handleJoinRequest(memberId, action),
  leaveTeam: (teamId) => leaveTeam(teamId),

  // Games
  getGames,
  getGameDetails: (sessionId) => getGameDetails(sessionId),
  registerForGame: (sessionId, teamSize) => registerForGame(sessionId, teamSize),
  confirmAttendance: (sessionId, confirmedTeamSize) => confirmAttendance(sessionId, confirmedTeamSize),
  cancelRegistration: (sessionId) => cancelRegistration(sessionId),
  getPaperLiveState: (sessionId, onData) => getPaperLiveState(sessionId, onData),

  // Leaderboard
  getLeaderboards,
}
