const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// Free fallback chain — no cost, but rate-limited and occasionally flaky.
// Ordered by quality, and spread across DIFFERENT providers so a per-model
// or per-provider 429 doesn't take out the whole chain (each provider has
// its own rate-limit bucket). All slugs verified against OpenRouter's live
// model list.
export const FREE_MODEL_CHAIN = [
    // Lead with the strongest free reasoners for grading accuracy, then fall
    // back to smaller/faster ones across different providers so a 429 on one
    // provider doesn't kill the chain.
    "openai/gpt-oss-120b:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-4-31b-it:free",
    "openai/gpt-oss-20b:free",
    "meta-llama/llama-3.2-3b-instruct:free",
] as const;

// Premium chain — paid Claude models. Reliable (no free-tier rate limits),
// costs ~$0.0015/analysis on Haiku. Used only when a paying user spends a
// credit. Haiku first; Sonnet as a quality fallback if Haiku ever errors.
export const PREMIUM_MODEL_CHAIN = [
    "anthropic/claude-opus-4-7",
] as const;

// Back-compat alias.
export const MODEL_CHAIN = FREE_MODEL_CHAIN;

export type Tier = "free" | "premium";

// User-selectable models. Free ones cost nothing; the premium one (Opus)
// charges a credit. This is the single source of truth the UI and API both
// use — the API validates any chosen model against this list and derives
// the billing tier from it, so the client can never bill itself as free
// while using a premium model.
export type ModelOption = { id: string; label: string; tier: Tier };

export const MODEL_OPTIONS: ModelOption[] = [
    { id: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B", tier: "free" },
    { id: "qwen/qwen3-next-80b-a3b-instruct:free", label: "Qwen3 Next 80B", tier: "free" },
    { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B", tier: "free" },
    { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", tier: "free" },
    { id: "openai/gpt-oss-20b:free", label: "GPT-OSS 20B", tier: "free" },
    { id: "anthropic/claude-opus-4-7", label: "Claude Opus 4.7", tier: "premium" },
];

/** The billing tier for a model id, or null if it's not an allowed model. */
export function modelTier(id: string): Tier | null {
    return MODEL_OPTIONS.find((m) => m.id === id)?.tier ?? null;
}

/**
 * Build the model chain to attempt. If the user picked a specific model we
 * try it first, then fall back to the OTHER models of the same tier for
 * reliability (so picking a free model that's momentarily 429'd still
 * succeeds on another free model — and never silently upgrades to premium).
 * With no explicit pick, use the default chain for the tier.
 */
export function resolveChain(
    model: string | undefined,
    tier: Tier,
): readonly string[] {
    if (model) {
        const t = modelTier(model);
        if (t) {
            const base = t === "premium" ? PREMIUM_MODEL_CHAIN : FREE_MODEL_CHAIN;
            return [model, ...base.filter((m) => m !== model)];
        }
    }
    return tier === "premium" ? PREMIUM_MODEL_CHAIN : FREE_MODEL_CHAIN;
}

// Credits consumed per PREMIUM analysis. With Opus 4.7 as the single
// premium model we use the simplest unit: 1 credit = 1 premium analysis.
// Packs are then sold directly as "N analyses" and priced with margin over
// Opus's worst-case cost (~$0.045/analysis). If you ever add a cheaper
// premium model you can drop its per-call cost below 1 by switching to a
// fractional credit scheme, but for a single Opus tier this stays 1.
export const PREMIUM_CREDIT_COST = 1;

// Multimodal content support (OpenAI-compatible). Vision-capable models
// (Claude Opus 4.7 etc.) accept content arrays with text + image_url blocks.
// Pure-text callers can keep passing a string as before.
export type ChatContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
    role: "system" | "user" | "assistant";
    content: string | ChatContentPart[];
};

export type OpenRouterResult = {
    content: string;
    model: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export class AllModelsFailedError extends Error {
    constructor(public lastStatus: number) {
        // Tailor the user-facing message to the actual failure so a
        // misconfiguration doesn't masquerade as "models busy".
        const message =
            lastStatus === 401 || lastStatus === 403
                ? "AI is not configured correctly (auth failed). Please contact support."
                : lastStatus === 400 || lastStatus === 404
                  ? "AI request was rejected by every model. The model list may be out of date."
                  : lastStatus === 429
                    ? "Free AI quota is exhausted for now. Try again later, or use a Premium credit (Claude) for instant analysis."
                    : "All AI models are busy right now. Please try again in a minute.";
        super(message);
        this.name = "AllModelsFailedError";
    }
}

async function callModel(
    model: string,
    messages: ChatMessage[],
    signal: AbortSignal,
    maxTokens: number,
): Promise<{ ok: true; result: OpenRouterResult } | { ok: false; status: number; retryable: boolean }> {
    if (!process.env.OPENROUTER_API_KEY) {
        console.error("[openrouter] OPENROUTER_API_KEY is not set");
        return { ok: false, status: 401, retryable: false };
    }

    const resp = await fetch(ENDPOINT, {
        method: "POST",
        signal,
        headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            // OpenRouter uses these for free-tier attribution / ranking.
            "HTTP-Referer": process.env.OPENROUTER_APP_URL ?? "http://localhost:3000",
            "X-Title": "RealTrack Study Companion",
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: 0.2, // low → consistent, fewer wasted tokens
            // Caller-controlled output cap. The analyze route wants this small
            // (single verdict, keep cost down); the quiz/flashcard generators
            // need it large enough to fit a full JSON ARRAY — a 500-token cap
            // truncates the array mid-way and silently drops questions/cards.
            max_tokens: maxTokens,
            // NOTE: response_format is intentionally omitted. Several
            // OpenRouter free models 400 on it; the prompt already asks for
            // JSON and parseAnalysis() extracts it defensively.
        }),
    });

    if (!resp.ok) {
        // Log the real reason so failures are diagnosable in Vercel logs /
        // local terminal instead of being hidden behind "all models busy".
        const bodyText = await resp.text().catch(() => "");
        console.error(
            `[openrouter] ${model} → ${resp.status}: ${bodyText.slice(0, 300)}`,
        );
        if (resp.status === 429) return { ok: false, status: 429, retryable: true };
        if (resp.status >= 500) return { ok: false, status: resp.status, retryable: true };
        // 400/401/403/404 are config/auth problems — retrying other models
        // won't help if it's auth, but a 400 might be model-specific, so we
        // still let the chain continue.
        return { ok: false, status: resp.status, retryable: false };
    }

    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content;
    // Some free providers occasionally return empty content — treat as retryable.
    if (!content) {
        console.error(`[openrouter] ${model} → empty content`, JSON.stringify(json).slice(0, 300));
        return { ok: false, status: 502, retryable: true };
    }

    return {
        ok: true,
        result: { content, model, usage: json.usage },
    };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chatWithFallback(
    messages: ChatMessage[],
    chainOrTier: readonly string[] | Tier = "free",
    opts: { deadlineMs?: number; maxTokens?: number } = {},
): Promise<OpenRouterResult> {
    // Output token cap. Default 500 keeps the analyze route cheap; generators
    // pass a larger value sized to the requested item count so the JSON array
    // isn't truncated. Floor at 256, ceil at 8000 to bound cost.
    const maxTokens = Math.min(8000, Math.max(256, opts.maxTokens ?? 500));
    // Accept either an explicit model chain or a tier (back-compat).
    const chain: readonly string[] = Array.isArray(chainOrTier)
        ? chainOrTier
        : chainOrTier === "premium"
          ? PREMIUM_MODEL_CHAIN
          : FREE_MODEL_CHAIN;

    // Total time budget shared across all attempts. Each pass tries every
    // model once; we retry the whole chain while there's budget and the
    // failures look transient (429 / 5xx / empty / network) — that's what
    // made a manual "click again" succeed.
    //
    // Callers that fan this out across multiple chunks (quiz/flashcard
    // generation) MUST pass a shrinking `deadlineMs` so the SUM of all calls
    // stays under the route's maxDuration — otherwise N chunks × 24s blows
    // past the Vercel function limit and triggers FUNCTION_INVOCATION_TIMEOUT.
    // Floor at 3s so a near-exhausted budget still allows one real attempt.
    const DEADLINE_MS = Math.max(3_000, opts.deadlineMs ?? 24_000);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEADLINE_MS);

    // Backoff between full passes (with light jitter).
    const PASS_BACKOFF_MS = [500, 1200, 2500];
    const MAX_PASSES = PASS_BACKOFF_MS.length + 1;

    let lastStatus = 0;
    try {
        for (let pass = 0; pass < MAX_PASSES; pass++) {
            let sawRetryable = false;
            for (const model of chain) {
                if (Date.now() - startedAt > DEADLINE_MS) {
                    throw new AllModelsFailedError(lastStatus || 503);
                }
                try {
                    const r = await callModel(model, messages, controller.signal, maxTokens);
                    if (r.ok) return r.result;
                    lastStatus = r.status;
                    if (r.retryable) sawRetryable = true;
                    // non-retryable (400/401/403/404): move to next model.
                } catch {
                    lastStatus = 503; // network / abort
                    sawRetryable = true;
                }
            }
            // If nothing in the chain was worth retrying (e.g. all hard 400s
            // or auth failures), retrying won't help — stop now.
            if (!sawRetryable) break;
            // Backoff before the next pass, unless we're out of passes/budget.
            const backoff = PASS_BACKOFF_MS[pass];
            if (backoff === undefined) break;
            if (Date.now() - startedAt + backoff > DEADLINE_MS) break;
            const jitter = Math.floor(Math.random() * 250);
            await sleep(backoff + jitter);
        }
        throw new AllModelsFailedError(lastStatus);
    } finally {
        clearTimeout(timeout);
    }
}