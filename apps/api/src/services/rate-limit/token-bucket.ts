/**
 * Per-org rate limiting for sensitive, cost-bearing routes (dispatch,
 * preflight). This is deliberately an interface (`RateLimiter`) so the storage
 * can be swapped -- an in-memory token bucket for a single API instance today,
 * a Redis/Upstash-backed limiter for a horizontally-scaled deployment later --
 * without touching the routes that consume it.
 *
 * The default implementation is a classic token bucket: each key (an org id)
 * gets a bucket that refills continuously at `refillPerSecond` up to
 * `capacity`. A request consumes one token; when the bucket is empty the
 * request is rejected and the caller is told how long to wait.
 */

export interface RateLimitResult {
  /** Whether the request is allowed to proceed. */
  allowed: boolean;
  /** Bucket capacity (the burst ceiling), echoed for response headers. */
  limit: number;
  /** Tokens left after this request (0 when rejected). */
  remaining: number;
  /** Seconds until at least one token is available again (0 when allowed). */
  retryAfterSeconds: number;
}

/**
 * Storage-agnostic per-key limiter. `key` is the tenant/org id in practice.
 */
export interface RateLimiter {
  /** Consume one token for `key`; returns whether the request may proceed. */
  consume(key: string): RateLimitResult;
}

export interface TokenBucketOptions {
  /** Maximum tokens a bucket can hold (burst size). */
  capacity: number;
  /** Sustained refill rate in tokens per second. */
  refillPerSecond: number;
  /** Injectable clock (ms epoch) for deterministic tests. */
  now?: () => number;
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

/**
 * In-memory token-bucket limiter. Suitable for a single API instance; state is
 * per-process and resets on restart (acceptable for abuse-throttling, which is
 * not a compliance-evidence surface). Idle buckets are pruned lazily.
 */
export class InMemoryTokenBucketRateLimiter implements RateLimiter {
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, BucketState>();
  /** Prune buckets untouched for this long to bound memory. */
  private static readonly IDLE_TTL_MS = 10 * 60 * 1000;

  constructor(options: TokenBucketOptions) {
    if (options.capacity <= 0) {
      throw new Error("Token bucket capacity must be > 0");
    }
    if (options.refillPerSecond <= 0) {
      throw new Error("Token bucket refillPerSecond must be > 0");
    }
    this.capacity = options.capacity;
    this.refillPerSecond = options.refillPerSecond;
    this.now = options.now ?? (() => Date.now());
  }

  consume(key: string): RateLimitResult {
    const nowMs = this.now();
    this.pruneIdle(nowMs);

    const bucket = this.buckets.get(key) ?? {
      tokens: this.capacity,
      lastRefillMs: nowMs,
    };

    // Continuous refill since the bucket was last touched.
    const elapsedSeconds = Math.max(0, (nowMs - bucket.lastRefillMs) / 1000);
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + elapsedSeconds * this.refillPerSecond,
    );
    bucket.lastRefillMs = nowMs;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.buckets.set(key, bucket);
      return {
        allowed: true,
        limit: this.capacity,
        remaining: Math.floor(bucket.tokens),
        retryAfterSeconds: 0,
      };
    }

    this.buckets.set(key, bucket);
    const deficit = 1 - bucket.tokens;
    const retryAfterSeconds = Math.ceil(deficit / this.refillPerSecond);
    return {
      allowed: false,
      limit: this.capacity,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  private pruneIdle(nowMs: number): void {
    for (const [key, state] of this.buckets) {
      if (nowMs - state.lastRefillMs > InMemoryTokenBucketRateLimiter.IDLE_TTL_MS) {
        this.buckets.delete(key);
      }
    }
  }
}

/**
 * Read the per-org dispatch limit from the environment, with production-safe
 * defaults. `DISPATCH_RATE_LIMIT_PER_MINUTE` sets the sustained ceiling;
 * `DISPATCH_RATE_LIMIT_BURST` sets the burst capacity (defaults to the
 * per-minute value so a fresh org can fire a minute's worth immediately).
 */
export function createDispatchRateLimiterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RateLimiter {
  const perMinute = parsePositiveInt(env.DISPATCH_RATE_LIMIT_PER_MINUTE, 30);
  const burst = parsePositiveInt(env.DISPATCH_RATE_LIMIT_BURST, perMinute);
  return new InMemoryTokenBucketRateLimiter({
    capacity: burst,
    refillPerSecond: perMinute / 60,
  });
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
