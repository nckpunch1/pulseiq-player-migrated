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
 * TTL-only, no explicit invalidation. A read within TTL_MS of a mutation may be
 * briefly stale (e.g. just registered, but the Games list still says "not
 * registered"). That is an accepted tradeoff for this pass — the window is short
 * enough to self-correct. Mutation-triggered invalidation is a deliberate later
 * step.
 */

// Short enough that post-mutation staleness self-corrects quickly, long enough
// to cover the tab-switching pattern this exists for. Tune here.
export const TTL_MS = 30_000

/** key -> { value, expiresAt } */
const store = new Map()

/** key -> Promise, so concurrent callers share one fetch instead of racing. */
const inFlight = new Map()

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

  const promise = (async () => {
    const value = await fetchFn()
    set(key, value, ttlMs)
    return value
  })()

  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}
