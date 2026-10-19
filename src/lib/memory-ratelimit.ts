/**
 * Fast, in-process fixed-window limiter for general traffic (scope WS9 "rate limiting").
 * Per instance by design: it blunts floods and runaway clients cheaply. Credential-guessing endpoints (login, pairing)
 * use the MySQL-backed limiter in ratelimit.ts, which is shared across instances. Add a CDN/WAF limit in front in production.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}
