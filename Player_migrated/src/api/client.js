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
  peekDashboard,
  peekGames,
  peekTeamId,
  peekLeaderboards,
  peekSeasonLeaderboard,
  getTeamId,
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
  listRegions,
  getSeasonLeaderboard,
  invalidateTeamAndGameState,
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

  // Cached-value peeks — let a screen render its last-known content on mount
  // instead of blanking to a loading state. See firebaseClient for semantics.
  peekDashboard,
  peekGames,
  peekTeamId,
  peekLeaderboards: (regionId) => peekLeaderboards(regionId),
  peekSeasonLeaderboard: (seasonId, regionId) => peekSeasonLeaderboard(seasonId, regionId),

  // Cache — for the one mutation that writes Firestore directly rather than
  // going through this client (Team.jsx's "Been approved? Tap to refresh").
  invalidateTeamAndGameState,

  // Team
  getTeamId,
  getTeam,
  createTeam: (teamName, regionId) => createTeam(teamName, regionId),
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
  listRegions,
  getSeasonLeaderboard: (seasonId, regionId) => getSeasonLeaderboard(seasonId, regionId),
}
