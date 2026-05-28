type CacheEntry<T> = { value: T; expiresAt: number };

const CACHE_TTL = Number(process.env.AI_CACHE_TTL_MS || 24 * 60 * 60 * 1000); // default 24h

const store: Map<string, CacheEntry<unknown>> = new Map();

export function cacheGet<T>(key: string): T | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return null;
  }
  return e.value as T;
}

export function cacheSet<T>(key: string, value: T, ttl = CACHE_TTL) {
  store.set(key, { value, expiresAt: Date.now() + ttl });
}

export function cacheDelete(key: string) {
  store.delete(key);
}

export function cacheClear() {
  store.clear();
}
import { createHash } from "crypto";
import { redis } from "./limits";
import type { AnalysisResult } from "./prompt";

const TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

// Normalize so trivial whitespace/case differences hit the same cache entry.
function norm(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function cacheKey(subject: string, question: string, answer: string): string {
    const h = createHash("sha256")
        .update(`${norm(subject)}|${norm(question)}|${norm(answer)}`)
        .digest("hex")
        .slice(0, 32);
    return `ai:analysis:${h}`;
}

export async function getCached(key: string): Promise<AnalysisResult | null> {
    return (await redis.get<AnalysisResult>(key)) ?? null;
}

export async function setCached(key: string, value: AnalysisResult): Promise<void> {
    await redis.set(key, value, { ex: TTL_SECONDS });
}