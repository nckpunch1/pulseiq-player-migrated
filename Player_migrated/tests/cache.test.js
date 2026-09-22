import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cached, cacheKey, clear, get, getStale, invalidate, set, TTL_MS } from '../src/api/cache'
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => { clear(); vi.useFakeTimers(); vi.setSystemTime(1000) })
afterEach(() => { clear(); vi.useRealTimers() })
describe('Player cache isolation and lifecycle', () => {
  it('separates users, regions and seasons without delimiter collisions', () => {
    const keys = [cacheKey('games', 'alice'), cacheKey('games', 'bob'), cacheKey('leaders', 'north', '2026'), cacheKey('leaders', 'south', '2026'), cacheKey('leaders', 'north', '2027'), cacheKey('games', 'a,b'), cacheKey('games', 'a', 'b')]
    expect(new Set(keys).size).toBe(keys.length)
    keys.forEach((key, i) => set(key, i))
    expect(keys.map(get)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
  it.each([null, undefined, false, 0, '', []])('caches legitimate empty/falsy results: %j', async value => {
    const load = vi.fn(async () => value)
    expect(await cached('k', TTL_MS, load)).toEqual(value)
    expect(await cached('k', TTL_MS, load)).toEqual(value)
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('expires exactly at TTL and fetches a fresh result', async () => {
    set('k', 'old', 100)
    vi.setSystemTime(1099)
    expect(get('k')).toBe('old')
    vi.setSystemTime(1100)
    expect(get('k')).toBeUndefined()
    expect(await cached('k', 100, async () => 'fresh')).toBe('fresh')
  })
  it('can seed stale UI data but explicit invalidation removes that seed', () => {
    set('games:alice', 'old', 10)
    vi.setSystemTime(2000)
    expect(getStale('games:alice')).toBe('old')
    expect(invalidate('games')).toBe(1)
    expect(getStale('games:alice')).toBeUndefined()
  })
  it('deduplicates concurrent reads without merging different users', async () => {
    const pending = deferred(), load = vi.fn(() => pending.promise)
    const a = cached('alice', 100, load), b = cached('alice', 100, load)
    expect(await cached('bob', 100, async () => 'Bob data')).toBe('Bob data')
    expect(load).toHaveBeenCalledTimes(1)
    pending.resolve('Alice data')
    expect(await Promise.all([a, b])).toEqual(['Alice data', 'Alice data'])
  })
  it('retries a failed request instead of caching the error', async () => {
    const failure = new Error('Offline'), load = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce('recovered')
    await expect(cached('k', 100, load)).rejects.toBe(failure)
    expect(getStale('k')).toBeUndefined()
    expect(await cached('k', 100, load)).toBe('recovered')
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('invalidates only the requested cache family across all users', () => {
    set(cacheKey('games', 'alice'), 1); set(cacheKey('games', 'bob'), 2); set('regions', 3)
    expect(invalidate('games')).toBe(2)
    expect(get(cacheKey('games', 'alice'))).toBeUndefined()
    expect(get('regions')).toBe(3)
    expect(invalidate('missing')).toBe(0)
  })
  it('an old in-flight response cannot overwrite post-mutation data', async () => {
    const pending = deferred(), oldRead = cached('games:alice', 100, () => pending.promise)
    expect(invalidate('games')).toBe(1)
    expect(await cached('games:alice', 100, async () => 'after registration')).toBe('after registration')
    pending.resolve('before registration')
    expect(await oldRead).toBe('before registration')
    expect(get('games:alice')).toBe('after registration')
  })
  it('sign-out clear prevents a late response from repopulating shared-device data', async () => {
    const pending = deferred(), oldRead = cached('games:alice', 100, () => pending.promise)
    set('leaders:north', 'private cached result')
    clear()
    pending.resolve('Alice data')
    await oldRead
    expect(getStale('games:alice')).toBeUndefined()
    expect(getStale('leaders:north')).toBeUndefined()
    expect(await cached('games:alice', 100, async () => 'new login')).toBe('new login')
  })
})
