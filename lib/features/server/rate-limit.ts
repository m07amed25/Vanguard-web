export interface RateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
  maxKeys?: number;
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface SlidingWindowRateLimiter {
  consume: (key: string) => RateLimitDecision;
  size: () => number;
}

const DEFAULT_MAX_REQUESTS = 20;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_KEYS = 10_000;

export function createSlidingWindowRateLimiter(
  options: RateLimitOptions = {},
): SlidingWindowRateLimiter {
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const now = options.now ?? (() => Date.now());

  const buckets = new Map<string, number[]>();

  function pruneExpired(cutoff: number) {
    for (const [bucketKey, timestamps] of buckets) {
      const fresh = timestamps.filter((ts) => ts > cutoff);
      if (fresh.length === 0) {
        buckets.delete(bucketKey);
      } else if (fresh.length !== timestamps.length) {
        buckets.set(bucketKey, fresh);
      }
    }
  }

  function consume(rawKey: string): RateLimitDecision {
    const key = rawKey.trim() || "anonymous";
    const current = now();
    const cutoff = current - windowMs;

    const existing = buckets.get(key) ?? [];
    const active = existing.filter((ts) => ts > cutoff);

    if (active.length >= maxRequests) {
      buckets.set(key, active);
      const oldest = active[0] ?? current;
      const retryAfterMs = Math.max(1_000, oldest + windowMs - current);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1_000),
      };
    }

    if (!buckets.has(key) && buckets.size >= maxKeys) {
      pruneExpired(cutoff);
      if (buckets.size >= maxKeys) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey !== undefined) {
          buckets.delete(oldestKey);
        }
      }
    }

    active.push(current);
    buckets.set(key, active);

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - active.length),
      retryAfterSeconds: 0,
    };
  }

  return {
    consume,
    size: () => buckets.size,
  };
}

export const scanRateLimiter = createSlidingWindowRateLimiter({
  maxRequests: DEFAULT_MAX_REQUESTS,
  windowMs: DEFAULT_WINDOW_MS,
  maxKeys: DEFAULT_MAX_KEYS,
});

export const healthRateLimiter = createSlidingWindowRateLimiter({
  maxRequests: 12,
  windowMs: DEFAULT_WINDOW_MS,
  maxKeys: DEFAULT_MAX_KEYS,
});
