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