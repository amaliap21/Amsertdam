import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const redis = Redis.fromEnv();

// Spam guard: max 5 requests / 10s per identifier (user or IP).
export const burstLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "10 s"),
    prefix: "rl:burst",
});

export const DAILY_QUOTA = 20;

// Seconds until the next UTC midnight (so the key auto-expires = daily reset).
function secondsUntilUtcMidnight(): number {
    const now = new Date();
    const next = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0,
    ));
    return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

function quotaKey(userId: string): string {
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    return `quota:${userId}:${day}`;
}

export async function peekQuota(userId: string): Promise<number> {
    const used = (await redis.get<number>(quotaKey(userId))) ?? 0;
    return Math.max(0, DAILY_QUOTA - used);
}

/** Atomically consume one unit. Returns remaining, or null if exhausted. */
export async function consumeQuota(userId: string): Promise<number | null> {
    const key = quotaKey(userId);
    const used = await redis.incr(key);
    if (used === 1) await redis.expire(key, secondsUntilUtcMidnight());
    if (used > DAILY_QUOTA) {
        await redis.decr(key);       // roll back the over-count
        return null;
    }
    return DAILY_QUOTA - used;
}

/** Give the unit back if the AI call failed — don't burn quota on errors. */
export async function refundQuota(userId: string): Promise<void> {
    await redis.decr(quotaKey(userId));
}

/**
 * Consume up to `n` units in one shot (per-card/question generation billing).
 * Consumes as many as fit under the daily cap, rolls back any overage, and
 * returns how many were ACTUALLY consumed (0 if the user is already at the cap).
 */
export async function consumeQuotaN(userId: string, n: number): Promise<number> {
    if (n <= 0) return 0;
    const key = quotaKey(userId);
    const used = await redis.incrby(key, n);
    await redis.expire(key, secondsUntilUtcMidnight());
    if (used > DAILY_QUOTA) {
        const rollback = Math.min(n, used - DAILY_QUOTA);
        if (rollback > 0) await redis.decrby(key, rollback);
        return n - rollback;
    }
    return n;
}

/** Refund `n` units (e.g. items reserved up front but never produced). */
export async function refundQuotaN(userId: string, n: number): Promise<void> {
    if (n > 0) await redis.decrby(quotaKey(userId), n);
}