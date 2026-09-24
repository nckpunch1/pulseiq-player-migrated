// @vitest-environment jsdom
// Team page (src/pages/Team.jsx): the whole team journey as the player sees it,
// driven by an in-memory Firestore whose onSnapshot listeners fire on every write,
// the same way the page's live listeners do in production.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
  const records = new Map()
  const listeners = new Set()
  const segments = path => path.split('/')
  const snapOf = path => {
    const parts = segments(path)
    return {
      id: parts.at(-1),
      ref: { path, id: parts.at(-1), parent: { id: parts.at(-2), parent: parts.length > 2 ? { id: parts.at(-3) } : null } },
      exists: () => records.has(path),
      data: () => records.get(path),
    }
  }
  const matches = (data, filters) => filters.every(({ field, op, value }) => (op === '==' ? data?.[field] === value : true))
  const evaluate = target => {
    if (target.type === 'doc') return snapOf(target.path)
    const src = target.type === 'query' ? target.src : target
    const filters = target.type === 'query' ? target.filters : []
    const paths = [...records.keys()].filter(p => {
      const parts = segments(p)
      if (src.type === 'group') return parts.length >= 2 && parts.at(-2) === src.name
      return p.startsWith(`${src.path}/`) && parts.length === segments(src.path).length + 1
    }).filter(p => matches(records.get(p), filters)).sort()
    const docs = paths.map(snapOf)
    return { docs, empty: docs.length === 0, size: docs.length }
  }
  const notify = () => { for (const l of listeners) l.fire() }
  return {
    records, listeners, evaluate, notify,
    failOn: null, // path whose listener should report an error
    reset() { records.clear(); listeners.clear(); this.failOn = null },
  }
})

vi.mock('firebase/firestore', () => {
  const join = (base, parts) => [...(typeof base === 'string' ? [base] : []), ...parts].join('/')
  let auto = 0
  return {
    doc: (base, ...parts) => ({ type: 'doc', path: base?.type === 'col' ? `${base.path}/${parts[0] ?? `auto-${++auto}`}` : join(base, parts) }),
    collection: (base, ...parts) => ({ type: 'col', path: join(base, parts) }),
    collectionGroup: (_db, name) => ({ type: 'group', name }),
    query: (src, ...filters) => ({ type: 'query', src, filters }),
    where: (field, op, value) => ({ field, op, value }),
    serverTimestamp: () => 'TS',
    getDoc: vi.fn(async ref => store.evaluate(ref)),
    getDocs: vi.fn(async ref => store.evaluate(ref)),
    setDoc: vi.fn(async (ref, data, opts) => { store.records.set(ref.path, opts?.merge ? { ...store.records.get(ref.path), ...data } : data); store.notify() }),
    updateDoc: vi.fn(async (ref, data) => { store.records.set(ref.path, { ...store.records.get(ref.path), ...data }); store.notify() }),
    addDoc: vi.fn(async (col, data) => { const path = `${col.path}/auto-${++auto}`; store.records.set(path, data); store.notify(); return { id: path.split('/').at(-1) } }),
    onSnapshot: (target, next, error) => {
      const listener = {
        fire: () => {
          const path = target.type === 'doc' ? target.path : (target.src?.path ?? target.path)
          if (store.failOn && path === store.failOn) { error?.({ code: 'permission-denied' }); return }
          next(store.evaluate(target))
        },
      }
      store.listeners.add(listener)
      queueMicrotask(() => { if (store.listeners.has(listener)) listener.fire() })
      return () => store.listeners.delete(listener)
    },
  }
})
const auth = vi.hoisted(() => ({ currentUser: null }))
vi.mock('../src/lib/firebase', () => ({ auth, firestore: {} }))
vi.mock('firebase/auth', () => ({ onAuthStateChanged: (_auth, cb) => { queueMicrotask(() => cb(auth.currentUser)); return () => {} } }))
const api = vi.hoisted(() => ({
  listRegions: vi.fn(), searchTeams: vi.fn(), requestToJoin: vi.fn(), createTeam: vi.fn(),
  handleJoinRequest: vi.fn(), leaveTeam: vi.fn(), invalidateTeamAndGameState: vi.fn(),
  requestTeamFromAdmin: vi.fn(), cancelTeamRequest: vi.fn(),
}))
vi.mock('../src/api/client', () => ({ api }))
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ setSessionFromResponse: vi.fn() }) }))
vi.mock('../src/api/inviteEmail', () => ({ sendInviteEmail: vi.fn() }))

import { getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { sendInviteEmail } from '../src/api/inviteEmail'
import Team from '../src/pages/Team'

const signIn = uid => { auth.currentUser = { uid, email: `${uid}@example.test` } }
const seed = entries => { for (const [path, data] of Object.entries(entries)) store.records.set(path, data) }
const write = async (path, data) => { await act(async () => { store.records.set(path, data); store.notify() }) }
const renderTeam = (url = '/team') => render(<MemoryRouter initialEntries={[url]}><Team /></MemoryRouter>)
const text = () => document.body.textContent

const OWLS = {
  'teams/owls': { name: 'Owls', captainId: 'cap', regionId: 'north' },
  'teams/owls/members/cap': { userId: 'cap', displayName: 'Cap', role: 'captain', status: 'member' },
  'teams/owls/members/mem': { userId: 'mem', displayName: 'Mem', role: 'member', status: 'member' },
}

beforeEach(() => {
  store.reset()
  vi.clearAllMocks()
  api.listRegions.mockResolvedValue([{ id: 'north', name: 'North' }, { id: 'south', name: 'South' }])
  api.searchTeams.mockResolvedValue({ teams: [{ id: 'owls', name: 'Owls', region_id: 'north', member_count: 2, captain_name: 'Cap' }] })
  api.requestToJoin.mockResolvedValue({ request: { id: 'solo', status: 'pending' } })
  api.createTeam.mockResolvedValue({ team: { id: 'new' } })
  api.handleJoinRequest.mockResolvedValue({})
  api.leaveTeam.mockResolvedValue({ team: null })
  api.requestTeamFromAdmin.mockResolvedValue({ request: { status: 'pending', region_id: 'north' } })
})
afterEach(cleanup)

describe('teamless player', () => {
  beforeEach(() => { signIn('solo'); seed({ 'users/solo': { role: 'player', teamId: null, regions: ['north'], displayName: 'Solo' } }) })

  it('creates a team in their only profile region without having to pick it', async () => {
    renderTeam()
    const name = await screen.findByPlaceholderText('e.g. Danger Noodles')
    await waitFor(() => expect(screen.getByLabelText('Region').value).toBe('north'))
    fireEvent.change(name, { target: { value: 'Falcons' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => expect(api.createTeam).toHaveBeenCalledWith('Falcons', 'north'))
  })

  it('shows a create-team failure instead of silently doing nothing', async () => {
    api.createTeam.mockRejectedValue(new Error('Select an existing region.'))
    renderTeam()
    fireEvent.change(await screen.findByPlaceholderText('e.g. Danger Noodles'), { target: { value: 'Falcons' } })
    await waitFor(() => expect(screen.getByLabelText('Region').value).toBe('north'))
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    expect(await screen.findByText('Select an existing region.')).toBeTruthy()
  })

  it('searches, runs the duplicate check, then requests to join', async () => {
    renderTeam('/team?tab=search')
    fireEvent.change(await screen.findByPlaceholderText('Search by team name…'), { target: { value: 'owl' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    const card = (await screen.findByText('Owls')).closest('.team-result-card')
    expect(within(card).getByText(/2 members · Captain: Cap/)).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Request to Join' }))
    await waitFor(() => expect(api.requestToJoin).toHaveBeenCalledWith('owls'))
    expect(await within(card).findByText('Requested')).toBeTruthy()
  })

  it('an existing request is recognised without sending another', async () => {
    seed({ ...OWLS, 'teams/owls/members/solo': { userId: 'solo', status: 'pending', role: 'member' } })
    renderTeam('/team?tab=search')
    fireEvent.change(await screen.findByPlaceholderText('Search by team name…'), { target: { value: 'owl' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    const card = (await screen.findByText('Owls')).closest('.team-result-card')
    fireEvent.click(within(card).getByRole('button', { name: 'Request to Join' }))
    expect(await within(card).findByText('Requested')).toBeTruthy()
    expect(api.requestToJoin).not.toHaveBeenCalled()
  })

  it('a region-less account is told why search is unavailable', async () => {
    api.searchTeams.mockResolvedValue({ teams: [], needs_region: true })
    renderTeam('/team?tab=search')
    fireEvent.change(await screen.findByPlaceholderText('Search by team name…'), { target: { value: 'owl' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText(/doesn't have a home region yet/)).toBeTruthy()
  })

  it('an empty search result says so', async () => {
    api.searchTeams.mockResolvedValue({ teams: [] })
    renderTeam('/team?tab=search')
    fireEvent.change(await screen.findByPlaceholderText('Search by team name…'), { target: { value: 'zzz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText(/No teams found for/)).toBeTruthy()
  })
})

describe('approval adoption (the pending-row bug fix)', () => {
  it('a PENDING row never assigns the team; accepting it does, and the page switches to the team view', async () => {
    signIn('solo')
    seed({ ...OWLS, 'users/solo': { role: 'player', teamId: null, regions: ['north'] }, 'teams/owls/members/solo': { userId: 'solo', status: 'pending', role: 'member', displayName: 'Solo' } })
    renderTeam()
    await screen.findByText('Create a Team')
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(store.records.get('users/solo').teamId).toBeNull()
    expect(updateDoc).not.toHaveBeenCalled()

    // Captain approves: the watcher sees an accepted row and adopts the team.
    await write('teams/owls/members/solo', { userId: 'solo', status: 'member', role: 'member', displayName: 'Solo' })
    await waitFor(() => expect(store.records.get('users/solo').teamId).toBe('owls'))
    expect(await screen.findByText('Owls')).toBeTruthy()
    expect(screen.getByText('Solo')).toBeTruthy()
  })
})

describe('team view', () => {
  it('a captain sees members (not pending requests) and can approve or reject a request', async () => {
    signIn('cap')
    seed({ ...OWLS, 'users/cap': { role: 'player', teamId: 'owls' }, 'teams/owls/members/solo': { userId: 'solo', status: 'pending', role: 'member', displayName: 'Solo Applicant' } })
    renderTeam()
    expect(await screen.findByText('Join Requests')).toBeTruthy()
    const members = screen.getByText('Members').parentElement
    expect(within(members).getByText('Mem')).toBeTruthy()
    expect(within(members).queryByText('Solo Applicant')).toBeNull()
    const request = screen.getByText('Solo Applicant').closest('.team-request-row')
    fireEvent.click(within(request).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.handleJoinRequest).toHaveBeenCalledWith('solo', 'approved'))
    fireEvent.click(within(request).getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(api.handleJoinRequest).toHaveBeenCalledWith('solo', 'rejected'))
  })

  it('an ordinary member sees no requests or invite controls, and can leave', async () => {
    signIn('mem')
    seed({ ...OWLS, 'users/mem': { role: 'player', teamId: 'owls' } })
    renderTeam()
    expect(await screen.findByText('Owls')).toBeTruthy()
    expect(screen.queryByText('Join Requests')).toBeNull()
    expect(screen.queryByPlaceholderText('player@email.com')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave Team' }))
    await waitFor(() => expect(api.leaveTeam).toHaveBeenCalledWith('owls'))
  })

  it('the Leave button is only on the viewer\'s own row', async () => {
    signIn('mem')
    seed({ ...OWLS, 'users/mem': { role: 'player', teamId: 'owls' } })
    renderTeam()
    await screen.findByText('Owls')
    expect(screen.getAllByRole('button', { name: 'Leave Team' })).toHaveLength(1)
    expect(screen.getByText('Mem').closest('.team-member-row').textContent).toContain('Leave Team')
  })

  it('a listener failure shows a recoverable error instead of hanging', async () => {
    signIn('mem')
    seed({ ...OWLS, 'users/mem': { role: 'player', teamId: 'owls' } })
    store.failOn = 'teams/owls'
    renderTeam()
    expect(await screen.findByText(/Failed to load team/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy()
  })
})

describe('captain invites (server-side lookup: the app never reads other profiles)', () => {
  const invite = async email => {
    fireEvent.change(await screen.findByPlaceholderText('player@email.com'), { target: { value: email } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
  }
  const reply = (status, body) => ({ ok: status < 300, status, json: async () => body })
  const readsOtherProfiles = () => getDocs.mock.calls.some(([q]) => q?.src?.path === 'users' || q?.path === 'users')
  beforeEach(() => { signIn('cap'); seed({ ...OWLS, 'users/cap': { role: 'player', teamId: 'owls' } }) })

  it('the server adds a registered same-region player; the client writes nothing itself', async () => {
    sendInviteEmail.mockResolvedValueOnce(reply(200, { outcome: 'added', displayName: 'Newbie' }))
    renderTeam()
    await invite('Newbie@Example.test ')
    expect(await screen.findByText(/Newbie added to your team/)).toBeTruthy()
    expect(sendInviteEmail).toHaveBeenCalledWith(expect.objectContaining({ toEmail: 'newbie@example.test', teamId: 'owls', teamName: 'Owls' }))
    expect(setDoc).not.toHaveBeenCalled()
    expect(readsOtherProfiles()).toBe(false)
  })

  it('reports a player who is already on this team', async () => {
    sendInviteEmail.mockResolvedValueOnce(reply(200, { outcome: 'already_member', displayName: 'Mem' }))
    renderTeam()
    await invite('mem@example.test')
    expect(await screen.findByText(/Mem is already in your team/)).toBeTruthy()
  })

  it('refuses a player who is already on another team', async () => {
    sendInviteEmail.mockResolvedValueOnce(reply(409, { outcome: 'other_team', displayName: 'Other' }))
    renderTeam()
    await invite('other@example.test')
    expect(await screen.findByText(/Other is already on another team/)).toBeTruthy()
  })

  it('refuses a player from another region, saying why', async () => {
    sendInviteEmail.mockResolvedValueOnce(reply(403, { outcome: 'wrong_region', displayName: 'Brissy' }))
    renderTeam()
    await invite('brissy@example.test')
    expect(await screen.findByText(/Brissy is in a different region/)).toBeTruthy()
  })

  it('emails an unregistered address, and reports each other server outcome', async () => {
    sendInviteEmail.mockResolvedValueOnce(reply(200, { outcome: 'emailed' }))
    renderTeam()
    await invite('stranger@example.test')
    expect(await screen.findByText(/Invite sent to stranger@example.test/)).toBeTruthy()

    sendInviteEmail.mockResolvedValueOnce(reply(403, {}))
    await invite('stranger@example.test')
    expect(await screen.findByText(/Couldn't send invite/)).toBeTruthy()

    sendInviteEmail.mockResolvedValueOnce(reply(500, {}))
    await invite('stranger@example.test')
    expect(await screen.findByText('Failed to send invite. Try again.')).toBeTruthy()

    sendInviteEmail.mockResolvedValueOnce({ ok: true, status: 200, stubbed: true })
    await invite('stranger@example.test')
    expect(await screen.findByText(/DEV: invitation simulated/)).toBeTruthy()
    expect(readsOtherProfiles()).toBe(false)
  })
})

describe('asking an admin for a team', () => {
  beforeEach(() => { signIn('solo'); seed({ 'users/solo': { role: 'player', teamId: null, regions: ['north'], displayName: 'Solo' } }) })
  const openForm = async () => fireEvent.click(await screen.findByRole('button', { name: /I need a team/ }))
  const send = () => fireEvent.click(screen.getAllByRole('button').find(b => /send|submit|request/i.test(b.textContent) && !/I need a team/.test(b.textContent)))

  it('files the request through the client (which tags the profile region)', async () => {
    renderTeam()
    await openForm()
    fireEvent.change(screen.getByPlaceholderText(/Optional note/), { target: { value: 'solo player' } })
    send()
    await waitFor(() => expect(api.requestTeamFromAdmin).toHaveBeenCalledWith('solo player'))
    expect(text()).not.toContain('Failed to send request')
  })

  it('a region-less account is told why the request cannot be routed', async () => {
    api.requestTeamFromAdmin.mockRejectedValue(Object.assign(new Error("Your account doesn't have a home region yet. Ask an admin to set your region."), { code: 'NEEDS_REGION' }))
    renderTeam()
    await openForm()
    send()
    expect(await screen.findByText(/doesn't have a home region yet/)).toBeTruthy()
  })
})
