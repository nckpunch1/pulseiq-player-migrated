/**
 * Mock API client for development.
 * Swap to real client by setting VITE_USE_MOCK_API=false in .env.local
 *
 * Add realistic delays to simulate network latency.
 */

const delay = (ms = 400) => new Promise(res => setTimeout(res, ms))

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PLAYER = {
  id: 'player_001',
  username: 'nickp',
  first_name: 'Nick',
  last_name: 'Panchuk',
  display_name: 'Nick Panchuk',
}

const MOCK_TEAM = {
  id: 'team_001',
  name: 'Danger Noodles',
  captain_player_id: 'player_001',
  member_count: 4,
  is_active: true,
  status: 'active',
}

const MOCK_MEMBERSHIP = {
  player_id: 'player_001',
  team_id: 'team_001',
  is_captain: true,
  is_scribe: true,
  effective_is_scribe: true,
  status: 'active',
}

const MOCK_MEMBERS = [
  { player_id: 'player_001', player_name: 'Nick Panchuk', is_captain: true, is_scribe: true, status: 'active' },
  { player_id: 'player_002', player_name: 'Sarah Jones', is_captain: false, is_scribe: false, status: 'active' },
  { player_id: 'player_003', player_name: 'Tom Riley', is_captain: false, is_scribe: false, status: 'active' },
  { player_id: 'player_004', player_name: 'Mia Chen', is_captain: false, is_scribe: false, status: 'active' },
]

const MOCK_GAMES = [
  {
    id: 'game_001',
    game_id: 'game_001',
    session_id: 'session_001',
    canonical_session_id: 'csession_001',
    title: 'Wednesday Night Quiz',
    venue: 'The Pig & Whistle, Brisbane',
    starts_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
    format: 'paper',
    registration_status: 'registered',
    team_id: 'team_001',
    team_name: 'Danger Noodles',
  },
  {
    id: 'game_002',
    game_id: 'game_002',
    session_id: 'session_002',
    canonical_session_id: 'csession_002',
    title: 'Friday Trivia Night',
    venue: 'The Triffid, Newstead',
    starts_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
    format: 'paper',
    registration_status: 'not_registered',
    team_id: null,
    team_name: null,
  },
  {
    id: 'game_003',
    game_id: 'game_003',
    session_id: 'session_003',
    canonical_session_id: 'csession_003',
    title: 'Sunday Session Quiz',
    venue: 'Lefty\'s Old Time Music Hall',
    starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
    format: 'paper',
    registration_status: 'not_registered',
    team_id: null,
    team_name: null,
  },
]

const MOCK_JOIN_REQUESTS = [
  {
    id: 'req_001',
    team_id: 'team_001',
    player_id: 'player_005',
    player_name: 'Alex Torres',
    player_username: 'alex_t',
    status: 'pending',
  },
  {
    id: 'req_002',
    team_id: 'team_001',
    player_id: 'player_006',
    player_name: 'Jamie Wu',
    player_username: 'jamiew',
    status: 'pending',
  },
]

const MOCK_LEADERBOARD = {
  current_season: { id: 'season_001', name: 'Season 1 — 2026', is_active: true },
  current_season_leaderboard: [
    { team_id: 'team_001', team_name: 'Danger Noodles', total_points: 24, games_played: 3, rank: 1 },
    { team_id: 'team_002', team_name: 'Quizzy Rascals', total_points: 20, games_played: 3, rank: 2 },
    { team_id: 'team_003', team_name: 'Team Chaos', total_points: 18, games_played: 3, rank: 3 },
    { team_id: 'team_004', team_name: 'The Usual Suspects', total_points: 14, games_played: 2, rank: 4 },
    { team_id: 'team_005', team_name: 'Trivia Newton John', total_points: 10, games_played: 2, rank: 5 },
  ],
  all_time_leaderboard: [
    { team_id: 'team_002', team_name: 'Quizzy Rascals', total_points: 88, games_played: 12, rank: 1 },
    { team_id: 'team_001', team_name: 'Danger Noodles', total_points: 72, games_played: 10, rank: 2 },
    { team_id: 'team_003', team_name: 'Team Chaos', total_points: 65, games_played: 11, rank: 3 },
  ],
}

// ─── Paper live state cycle counter ──────────────────────────────────────────
let paperLiveStateCallCount = 0

// ─── Mock handlers ────────────────────────────────────────────────────────────

export const mockApi = {
  async post(endpoint, body = {}) {
    await delay()

    switch (endpoint) {

      case 'externalPlayerLogin': {
        if (body.username === 'wrong' || body.password === 'wrong') {
          return { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect username or password.' } }
        }
        return {
          success: true,
          data: {
            player: MOCK_PLAYER,
            player_session_token: 'mock_token_abc123',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        }
      }

      case 'externalPlayerRegister': {
        if (body.username === 'taken') {
          return { success: false, error: { code: 'USERNAME_TAKEN', message: 'That username is already taken.' } }
        }
        return {
          success: true,
          data: {
            player: { ...MOCK_PLAYER, username: body.username, first_name: body.first_name, last_name: body.last_name },
            player_session_token: 'mock_token_new123',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        }
      }

      case 'externalPlayerMe':
        return { success: true, data: { player: MOCK_PLAYER, team: MOCK_TEAM, membership: MOCK_MEMBERSHIP } }

      case 'externalPlayerLogout':
        return { success: true, data: { logged_out: true } }

      case 'externalPlayerDashboard':
        return {
          success: true,
          data: {
            player: MOCK_PLAYER,
            team: MOCK_TEAM,
            membership: MOCK_MEMBERSHIP,
            upcoming_games: MOCK_GAMES,
            registered_games: [MOCK_GAMES[0]],
            pending_join_requests: MOCK_JOIN_REQUESTS,
            leaderboard_summary: { team_current_season_rank: 1, team_all_time_rank: 2 },
          },
        }

      case 'externalPlayerGetTeam':
        return { success: true, data: { team: MOCK_TEAM, membership: MOCK_MEMBERSHIP, members: MOCK_MEMBERS } }

      case 'externalPlayerCreateTeam':
        return {
          success: true,
          data: {
            team: { ...MOCK_TEAM, name: body.team_name, id: 'team_new' },
            membership: { ...MOCK_MEMBERSHIP, team_id: 'team_new' },
          },
        }

      case 'externalPlayerSearchTeams': {
        const q = (body.query || '').toLowerCase()
        const results = [
          { id: 'team_002', name: 'Quizzy Rascals', member_count: 5, captain_name: 'Sarah' },
          { id: 'team_003', name: 'Team Chaos', member_count: 3, captain_name: 'Tom' },
          { id: 'team_006', name: 'Brain Drains', member_count: 6, captain_name: 'Priya' },
        ].filter(t => t.name.toLowerCase().includes(q))
        return { success: true, data: { teams: results } }
      }

      case 'externalPlayerRequestToJoinTeam':
        return { success: true, data: { request: { id: 'req_new', team_id: body.team_id, status: 'pending' }, status: 'pending' } }

      case 'externalPlayerGetTeamJoinRequests':
        return { success: true, data: { requests: MOCK_JOIN_REQUESTS } }

      case 'externalPlayerHandleJoinRequest':
        return {
          success: true,
          data: {
            request: { id: body.request_id, status: body.action },
            team: MOCK_TEAM,
            members: MOCK_MEMBERS,
          },
        }

      case 'externalPlayerLeaveTeam':
        return { success: true, data: { team: null, membership: null, members: [] } }

      case 'externalPlayerRemoveMember':
        return { success: true, data: { success: true } }

      case 'externalPlayerAssignScribe':
        return { success: true, data: { members: MOCK_MEMBERS, scribe_player_id: body.target_player_id } }

      case 'externalPlayerGetGames':
        return { success: true, data: { games: MOCK_GAMES } }

      case 'externalPlayerGetGameDetails': {
        const game = MOCK_GAMES.find(g => g.id === body.game_id || g.canonical_session_id === body.game_id) || MOCK_GAMES[0]
        return {
          success: true,
          data: {
            game,
            team: MOCK_TEAM,
            registration: game.registration_status !== 'not_registered' ? {
              id: 'reg_001',
              session_id: game.session_id,
              game_id: game.game_id,
              canonical_session_id: game.canonical_session_id,
              team_id: 'team_001',
              team_name: 'Danger Noodles',
              status: 'registered',
              attendance_status: 'not_requested',
              confirmed_team_size: null,
            } : null,
            can_register: game.registration_status === 'not_registered',
            can_confirm_attendance: game.registration_status === 'attendance_requested',
            message: '',
          },
        }
      }

      case 'externalPlayerRegisterTeamForGame':
        return {
          success: true,
          data: {
            registration: {
              id: 'reg_new',
              session_id: 'session_001',
              game_id: body.game_id,
              canonical_session_id: 'csession_001',
              team_id: 'team_001',
              team_name: 'Danger Noodles',
              status: 'registered',
              attendance_status: 'not_requested',
            },
          },
        }

      case 'externalPlayerConfirmAttendance':
        return {
          success: true,
          data: {
            registration: {
              id: 'reg_001',
              attendance_status: 'confirmed',
              confirmed_team_size: body.confirmed_team_size,
            },
          },
        }

      case 'externalPlayerGetLeaderboards':
        return { success: true, data: MOCK_LEADERBOARD }

      case 'externalPlayerGetPaperLiveState': {
        const call = ++paperLiveStateCallCount
        const now = new Date().toISOString()

        const game = {
          id: 'game_001',
          title: 'Wednesday Night Quiz',
          venue: 'The Pig & Whistle',
        }
        const team = { id: 'team_001', name: 'Brick to the face' }
        const membership = { is_captain: false, is_scribe: false, effective_is_scribe: false }
        const registration = {
          id: 'reg_001',
          status: 'confirmed',
          registration_status: 'confirmed',
          attendance_status: 'confirmed',
          expected_team_size: 4,
          confirmed_team_size: 4,
        }

        if (call <= 3) {
          return {
            success: true, data: {
              game: { ...game, live_state: 'lobby' },
              team, membership, registration,
              team_score: { team_id: 'team_001', team_name: 'Brick to the face', total_score: 0, current_round_score: 0, rank: null, games_played: 0 },
              current_round: null, round_scores: [], leaderboard: [],
              message: '', last_updated_at: now,
            },
          }
        }

        if (call <= 6) {
          return {
            success: true, data: {
              game: { ...game, live_state: 'round_active' },
              team, membership, registration,
              team_score: { team_id: 'team_001', team_name: 'Brick to the face', total_score: 0, current_round_score: 0, rank: null, games_played: 0 },
              current_round: {
                round_index: 0, round_number: 1, title: 'General Knowledge',
                description: 'A mix of everything', round_type: 'standard',
                is_betting_round: false, question_count: 10, points_available: 10,
              },
              round_scores: [], leaderboard: [],
              message: '', last_updated_at: now,
            },
          }
        }

        const leaderboard5 = [
          { rank: 1, team_id: 'team_002', team_name: 'Danger Noodles', total_score: 10, current_round_score: 10 },
          { rank: 2, team_id: 'team_001', team_name: 'Brick to the face', total_score: 8, current_round_score: 8 },
          { rank: 3, team_id: 'team_003', team_name: 'Team Chaos', total_score: 7, current_round_score: 7 },
          { rank: 4, team_id: 'team_004', team_name: 'Quizzy Rascals', total_score: 6, current_round_score: 6 },
          { rank: 5, team_id: 'team_005', team_name: 'Brain Drains', total_score: 4, current_round_score: 4 },
        ]
        const round1Score = [{ round_number: 1, round_name: 'General Knowledge', score: 8 }]

        if (call <= 9) {
          return {
            success: true, data: {
              game: { ...game, live_state: 'round_results' },
              team, membership, registration,
              team_score: { team_id: 'team_001', team_name: 'Brick to the face', total_score: 8, current_round_score: 8, rank: 2, games_played: 0 },
              current_round: {
                round_index: 0, round_number: 1, title: 'General Knowledge',
                description: 'A mix of everything', round_type: 'standard',
                is_betting_round: false, question_count: 10, points_available: 10,
              },
              round_scores: round1Score, leaderboard: leaderboard5,
              message: '', last_updated_at: now,
            },
          }
        }

        if (call <= 12) {
          return {
            success: true, data: {
              game: { ...game, live_state: 'round_active' },
              team, membership, registration,
              team_score: { team_id: 'team_001', team_name: 'Brick to the face', total_score: 8, current_round_score: 0, rank: 2, games_played: 0 },
              current_round: {
                round_index: 1, round_number: 2, title: 'Science & Nature',
                description: 'From atoms to ecosystems', round_type: 'standard',
                is_betting_round: false, question_count: 10, points_available: 10,
              },
              round_scores: round1Score, leaderboard: [],
              message: '', last_updated_at: now,
            },
          }
        }

        return {
          success: true, data: {
            game: { ...game, live_state: 'game_over' },
            team, membership, registration,
            team_score: { team_id: 'team_001', team_name: 'Brick to the face', total_score: 52, current_round_score: 0, rank: 2, games_played: 1 },
            current_round: null,
            round_scores: [
              { round_number: 1, round_name: 'General Knowledge', score: 8 },
              { round_number: 2, round_name: 'Science & Nature', score: 9 },
              { round_number: 3, round_name: 'History', score: 7 },
              { round_number: 4, round_name: 'Music', score: 10 },
              { round_number: 5, round_name: 'Sport', score: 9 },
              { round_number: 6, round_name: 'Pot Luck', score: 9 },
            ],
            leaderboard: [
              { rank: 1, team_id: 'team_002', team_name: 'Danger Noodles', total_score: 55, current_round_score: 0 },
              { rank: 2, team_id: 'team_001', team_name: 'Brick to the face', total_score: 52, current_round_score: 0 },
              { rank: 3, team_id: 'team_003', team_name: 'Team Chaos', total_score: 48, current_round_score: 0 },
              { rank: 4, team_id: 'team_004', team_name: 'Quizzy Rascals', total_score: 45, current_round_score: 0 },
              { rank: 5, team_id: 'team_005', team_name: 'Brain Drains', total_score: 38, current_round_score: 0 },
            ],
            message: '', last_updated_at: now,
          },
        }
      }

      default:
        return { success: false, error: { code: 'UNKNOWN_ENDPOINT', message: `Mock: no handler for ${endpoint}` } }
    }
  },
}
