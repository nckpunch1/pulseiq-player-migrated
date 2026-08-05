/**
 * Module-level TTL cache for navigation-repeated reads.
 *
 * The player app has no cache at any layer: every screen refetches on mount,
 * so tab-switching Dashboard → Games → Leaderboard → Dashboard re-runs hundreds
 * of Firestore reads and flashes a blank loading screen each time. On pub wifi
 * each of those round-trips is 1-3s.
 *
 * Scope is deliberately narrow — this caches one-shot getDocs/getDoc reads only:
 *   - NOT auth state or the user doc (useAuth must stay live)
 *   - NOT onSnapshot listeners (already live by definition)
 *   - NOT mutations (never cache a write)
 *
 * TTL plus explicit invalidation. Mutations that change what a cached read would
 * return call `invalidate(prefix)` so the next load is fresh instead of waiting
 * out the TTL. The TTL remains the backstop for everything not covered by an
 * explicit invalidation (data changed by other users, or on another device).
 */

// Short enough that post-mutation staleness self-corrects quickly, long enough
// to cover the tab-switching pattern this exists for. Tune here.
export const TTL_MS = 30_000

/** key -> { value, expiresAt } */
const store = new Map()

/** key -> Promise, so concurrent callers share one fetch instead of racing. */
const inFlight = new Map()

/**
 * key -> how many times that key has been invalidated.
 *
 * This exists for one race. Dropping a key from `inFlight` stops *later* callers
 * joining a fetch that predates the mutation, but it does nothing about the
 * fetch already running: that promise still resolves and would still write its
 * pre-mutation value into the store, for a fresh full TTL, moments after the
 * invalidation meant to remove it. So `cached` records the key's generation when
 * it starts and only stores the result if the generation is unchanged.
 */
const generations = new Map()

/** Bumped by `clear()`, so an in-flight fetch spanning a sign-out can't repopulate. */
let epoch = 0

function generationOf(key) {
  return generations.get(key) ?? 0
}

/**
 * Live entry for `key`, or null. Evicts on read if expired, so the map does not
 * accumulate dead entries for keys that are still being requested.
 */
function peek(key) {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() >= entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry
}

/** Cached value if present and fresh, else undefined. */
export function get(key) {
  return peek(key)?.value
}

export function set(key, value, ttlMs = TTL_MS) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

/**
 * Build a cache key from a name plus its arguments. Callers must include every
 * input the result depends on — including the uid for per-user reads — so that
 * different users, regions or seasons can never collide.
 */
export function cacheKey(name, ...args) {
  return args.length ? `${name}:${JSON.stringify(args)}` : name
}

/**
 * Fresh cached value for `key`, otherwise awaits `fetchFn()`, stores and returns
 * it.
 *
 * Rejections are never cached, and the in-flight entry is always cleared, so a
 * failed fetch leaves no poisoned state — the next caller retries for real.
 * Uses `peek` rather than `get` so a legitimately-undefined value would still
 * count as a hit.
 */
export async function cached(key, ttlMs, fetchFn) {
  const entry = peek(key)
  if (entry) return entry.value

  const pending = inFlight.get(key)
  if (pending) return pending

  // Snapshot both counters before fetching, so we can tell on resolution whether
  // this key (or the whole cache) was invalidated while we were in flight.
  const startedGeneration = generationOf(key)
  const startedEpoch = epoch

  const promise = (async () => {
    const value = await fetchFn()
    // Invalidated mid-flight: hand the value to the caller who asked for it, but
    // do not store it — it is already known to be out of date.
    if (generationOf(key) === startedGeneration && epoch === startedEpoch) {
      set(key, value, ttlMs)
    }
    return value
  })()

  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}

/**
 * Drop every cached entry whose key starts with `prefix`.
 *
 * Keys are `name:[args]`, so passing a bare function name clears that function's
 * entries for every argument combination — including every uid. That is
 * deliberately blunt: correctness over precision, and the cost of clearing
 * another signed-out user's entry is one extra fetch that will never happen.
 *
 * Returns the number of keys affected (handy in tests and logs).
 */
export function invalidate(prefix) {
  // Collect first: we mutate both maps below, and an in-flight key may not be in
  // the store yet (or at all, if its fetch has not resolved).
  const keys = new Set()
  for (const key of store.keys()) if (key.startsWith(prefix)) keys.add(key)
  for (const key of inFlight.keys()) if (key.startsWith(prefix)) keys.add(key)

  for (const key of keys) {
    store.delete(key)
    // Later callers must not join a fetch that started before the mutation...
    inFlight.delete(key)
    // ...and that fetch, still running, must not store what it returns.
    generations.set(key, generationOf(key) + 1)
  }
  return keys.size
}

/**
 * Empty the cache entirely. Used on sign-out so one account's data does not sit
 * in memory on a shared device. Bumps `epoch` rather than clearing generations,
 * so a fetch that spans the sign-out cannot repopulate the store afterwards.
 */
export function clear() {
  epoch += 1
  store.clear()
  inFlight.clear()
  generations.clear()
}
