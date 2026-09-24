// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const sdk = vi.hoisted(() => ({ listeners: [], set: vi.fn() }))
vi.mock('../src/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/database', () => ({
  ref: (_db, path) => path,
  onValue: (path, next, error) => { const stop = vi.fn(); sdk.listeners.push({ path, next, error, stop }); return stop },
  set: sdk.set,
}))
import { usePaperLiveGame } from '../src/hooks/usePaperLiveGame'
import { usePulseSession } from '../src/hooks/usePulseSession'
const emit = (index, data) => act(() => sdk.listeners[index].next({ val: () => data, exists: () => data !== null }))
beforeEach(() => { sdk.listeners.length = 0; sdk.set.mockReset().mockResolvedValue(); vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
it('paper listens on the exact game path and maps timestamps and team identity', () => {
  const { result } = renderHook(() => usePaperLiveGame('game'))
  expect(sdk.listeners[0].path).toBe('liveSessions/game')
  expect(result.current.loading).toBe(true)
  expect(result.current.isPolling).toBe(true)
  const data = { phase: 'question', team: { id: 'team' } }
  emit(0, data)
  expect(result.current).toMatchObject({ liveState: data, lastKnownGoodState: data, teamId: 'team', loading: false, consecutiveFailures: 0 })
  expect(result.current.lastUpdatedAt).toEqual(new Date())
  expect(result.current.lastPollAttempt).toEqual(result.current.lastUpdatedAt)
})
it('paper times out after ten seconds and still accepts a late snapshot', () => {
  const { result } = renderHook(() => usePaperLiveGame('game'))
  act(() => vi.advanceTimersByTime(9999))
  expect(result.current.loading).toBe(true)
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.loading).toBe(false)
  emit(0, { phase: 'lobby' })
  expect(result.current.liveState).toEqual({ phase: 'lobby' })
})
it('paper retains last good state on errors, counts failures and recovers', () => {
  const { result } = renderHook(() => usePaperLiveGame('game'))
  emit(0, { phase: 'question' })
  act(() => { sdk.listeners[0].error(new Error('offline')); sdk.listeners[0].error(new Error('offline')) })
  expect(result.current).toMatchObject({ consecutiveFailures: 2, isReconnecting: true, lastKnownGoodState: { phase: 'question' } })
  emit(0, { phase: 'answer' })
  expect(result.current).toMatchObject({ consecutiveFailures: 0, isReconnecting: false, liveState: { phase: 'answer' } })
})
it('paper null snapshots clear state and eventually stop loading', () => {
  const { result } = renderHook(() => usePaperLiveGame('game'))
  emit(0, null)
  expect(result.current.teamId).toBeNull()
  act(() => vi.advanceTimersByTime(10000))
  expect(result.current.loading).toBe(false)
})
it('paper does not subscribe without a game and cancels listener/timer on unmount', () => {
  const { rerender, unmount } = renderHook(({ id }) => usePaperLiveGame(id), { initialProps: { id: null } })
  expect(sdk.listeners).toHaveLength(0)
  rerender({ id: 'game' })
  unmount()
  expect(sdk.listeners[0].stop).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
it('paper switches subscriptions without leaving the old timer running', () => {
  const { rerender } = renderHook(({ id }) => usePaperLiveGame(id), { initialProps: { id: 'a' } })
  rerender({ id: 'b' })
  expect(sdk.listeners[0].stop).toHaveBeenCalledOnce()
  expect(sdk.listeners[1].path).toBe('liveSessions/b')
  expect(vi.getTimerCount()).toBe(1)
})
it.fails('KNOWN GAP: paper must clear the old game state when game ID changes', () => {
  const { result, rerender } = renderHook(({ id }) => usePaperLiveGame(id), { initialProps: { id: 'a' } })
  emit(0, { team: { id: 'old-team' } })
  rerender({ id: 'b' })
  expect(result.current.liveState).toBeNull()
  expect(result.current.teamId).toBeNull()
})
it.each([[null, 'session'], ['team', null], [null, null]])('Pulse needs both identifiers (%s, %s)', async (team, session) => {
  const { result } = renderHook(() => usePulseSession(team, session))
  expect(result.current.sessionId).toBeNull()
  expect(sdk.listeners).toHaveLength(0)
  await act(async () => result.current.submitAnswer('10'))
  expect(sdk.set).not.toHaveBeenCalled()
})
it('Pulse maps existing/missing snapshots and preserves state on subscription error', () => {
  const { result } = renderHook(() => usePulseSession('team', 'session'))
  expect(sdk.listeners[0].path).toBe('pulseSessions/session')
  emit(0, { miniGame: { phase: 'active' } })
  act(() => sdk.listeners[0].error(new Error('offline')))
  expect(result.current.sessionData).toEqual({ miniGame: { phase: 'active' } })
  emit(0, null)
  expect(result.current.sessionData).toBeNull()
})
it('Pulse submits numeric answers only to the active session/team and propagates write failure', async () => {
  const { result } = renderHook(() => usePulseSession('team', 'session'))
  await act(async () => result.current.submitAnswer('12.5'))
  expect(sdk.set).toHaveBeenCalledWith('pulseSessions/session/miniGame/submissions/team', 12.5)
  sdk.set.mockRejectedValueOnce(new Error('denied'))
  await expect(result.current.submitAnswer('1')).rejects.toThrow('denied')
})
it('Pulse team change targets the new team without duplicating the session listener', async () => {
  const { result, rerender } = renderHook(({ team }) => usePulseSession(team, 'session'), { initialProps: { team: 'a' } })
  rerender({ team: 'b' })
  await act(async () => result.current.submitAnswer('0'))
  expect(sdk.listeners).toHaveLength(1)
  expect(sdk.set).toHaveBeenCalledWith('pulseSessions/session/miniGame/submissions/b', 0)
})
it('Pulse clears state when leaving a team and unsubscribes', () => {
  const { result, rerender } = renderHook(({ team }) => usePulseSession(team, 'session'), { initialProps: { team: 'team' } })
  emit(0, { phase: 'active' })
  rerender({ team: null })
  expect(result.current).toMatchObject({ sessionId: null, sessionData: null })
  expect(sdk.listeners[0].stop).toHaveBeenCalledOnce()
})
it('Pulse switches sessions and unsubscribes on unmount', () => {
  const { rerender, unmount } = renderHook(({ id }) => usePulseSession('team', id), { initialProps: { id: 'a' } })
  rerender({ id: 'b' })
  expect(sdk.listeners[0].stop).toHaveBeenCalledOnce()
  expect(sdk.listeners[1].path).toBe('pulseSessions/b')
  unmount()
  expect(sdk.listeners[1].stop).toHaveBeenCalledOnce()
})
it.fails('KNOWN GAP: Pulse must not expose the old session data while the new session loads', () => {
  const { result, rerender } = renderHook(({ id }) => usePulseSession('team', id), { initialProps: { id: 'a' } })
  emit(0, { phase: 'old-game' })
  rerender({ id: 'b' })
  expect(result.current.sessionData).toBeNull()
})
