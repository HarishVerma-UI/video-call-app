// Fixed-window, in-memory rate limiter. Good enough for one server instance;
// move to Redis when running several.

export function createRateLimiter({ limit, windowMs }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref?.();

  return {
    /** Returns { ok, retryAfterSec } and counts the attempt. */
    hit(key) {
      const now = Date.now();
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(key, entry);
      }
      entry.count++;
      return { ok: entry.count <= limit, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
    },
    reset(key) {
      hits.delete(key);
    },
    close() {
      clearInterval(sweep);
    },
  };
}
