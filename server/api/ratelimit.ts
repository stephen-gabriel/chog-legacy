import { AppError } from '../../src/server/errors';

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): void {
    const t = this.now();
    this.sweep(t);
    const b = this.buckets.get(key);
    if (!b || t >= b.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: t + this.windowMs });
      return;
    }
    if (b.count >= this.max) {
      const retryAfter = Math.ceil((b.resetAt - t) / 1000);
      throw new AppError('RATE_LIMITED', `Too many requests. Retry in ${retryAfter}s.`);
    }
    b.count += 1;
  }

  private sweep(t: number): void {
    if (this.buckets.size < 10_000) return;
    for (const [k, b] of this.buckets) {
      if (t >= b.resetAt) this.buckets.delete(k);
    }
  }
}
