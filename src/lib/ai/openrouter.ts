const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// Free fallback chain — no cost, but rate-limited and occasionally flaky.
// Ordered by quality, and spread across DIFFERENT providers so a per-model
// or per-provider 429 doesn't take out the whole chain (each provider has
// its own rate-limit bucket). All slugs verified against OpenRouter's live
// model list.
export const FREE_MODEL_CHAIN = [
    // Ordered by MEASURED reliability + speed on the structured-JSON task, and
    // spread across providers so a per-provider 429 doesn't kill the chain.
    // Lead with fast INSTRUCT models (not reasoning models): reasoning models
    // burn the token budget "thinking" and are slow (10-46s), which times out
    // under the route deadline and silently drops to the basic extractor.
    // Benchmarks: qwen3-next ~6s ok, gemma-4 ~7s ok, gpt-oss-120b ok but slow
    // (reasoning), nemotron-super ~15s ok. glm-4.5-air (46s) and llama-3.2-3b
    // (too weak) were dropped; llama-3.3-70b kept last (frequently 429/empty).
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "openai/gpt-oss-120b:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "openai/gpt-oss-20b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
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
    // First entry is the UI default. Lead with the fastest, most reliable free
    // JSON producer (measured) so the default pick actually succeeds.
    { id: "qwen/qwen3-next-80b-a3b-instruct:free", label: "Qwen3 Next 80B", tier: "free" },
    { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", tier: "free" },
    { id: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B", tier: "free" },
    { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B", tier: "free" },
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
                : lastStatus === 402
                  ? "Premium AI is temporarily unavailable: the OpenRouter account has insufficient credits. Please top it up at openrouter.ai/settings/credits."
                  : lastStatus === 400 || lastStatus === 404
                    ? "AI request was rejected by every model. The model list may be out of date."
                    : lastStatus === 429
                      ? "Free AI quota is exhausted for now. Try again later, or use a Premium credit (Claude) for instant analysis."
                      : "All AI models are busy right now. Please try again in a minute.";
        super(message);
        this.name = "AllModelsFailedError";
    }
}

// ── Direct Anthropic (Claude) API ─────────────────────────────────────────
// Premium models are paid Claude models. We bill them against the user's
// OWN funded Anthropic account (ANTHROPIC_API_KEY), NOT OpenRouter — routing
// Claude through an unfunded OpenRouter account just yields 402s that surface
// as "all models busy". Anthropic uses a different request shape (top-level
// `system`, base64 image blocks) and REQUIRES max_tokens, so we translate.
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** True for the premium Claude models that should hit Anthropic directly. */
function isAnthropicModel(model: string): boolean {
    return model.startsWith("anthropic/") || model.startsWith("claude");
}

/** Translate an OpenRouter-style message content into Anthropic's shape. */
function toAnthropicContent(content: ChatMessage["content"]) {
    if (typeof content === "string") return content;
    return content.map((part) => {
        if (part.type === "text") return { type: "text", text: part.text };
        // OpenRouter sends images as a data URL; Anthropic wants a base64
        // image block (or a url source). Parse the data URL when present.
        const url = part.image_url.url;
        const m = url.match(/^data:([^;]+);base64,(.*)$/);
        if (m) {
            return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
        }
        return { type: "image", source: { type: "url", url } };
    });
}

async function callAnthropic(
    model: string,
    messages: ChatMessage[],
    signal: AbortSignal,
    maxTokens: number,
): Promise<{ ok: true; result: OpenRouterResult } | { ok: false; status: number; retryable: boolean }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error("[anthropic] ANTHROPIC_API_KEY is not set");
        return { ok: false, status: 401, retryable: false };
    }
    // Strip the OpenRouter "anthropic/" prefix → bare Anthropic model id.
    const anthropicModel = model.replace(/^anthropic\//, "");
    const system = messages
        .filter((m) => m.role === "system")
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .join("\n\n")
        .trim();
    const convo = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: toAnthropicContent(m.content) }));

    const resp = await fetch(ANTHROPIC_ENDPOINT, {
        method: "POST",
        signal,
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
            // NOTE: `temperature` is intentionally omitted — newer Claude
            // models (e.g. claude-opus-4-7) reject it ("temperature is
            // deprecated for this model") and 400 the whole request.
            model: anthropicModel,
            max_tokens: maxTokens,
            ...(system ? { system } : {}),
            messages: convo,
        }),
    });

    if (!resp.ok) {
        const bodyText = await resp.text().catch(() => "");
        console.error(`[anthropic] ${anthropicModel} → ${resp.status}: ${bodyText.slice(0, 300)}`);
        if (resp.status === 429) return { ok: false, status: 429, retryable: true };
        if (resp.status >= 500) return { ok: false, status: resp.status, retryable: true };
        return { ok: false, status: resp.status, retryable: false };
    }

    const json = await resp.json();
    const blocks: Array<{ type: string; text?: string }> = json?.content ?? [];
    const content = blocks
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");
    if (!content) {
        console.error(`[anthropic] ${anthropicModel} → empty content`, JSON.stringify(json).slice(0, 300));
        return { ok: false, status: 502, retryable: true };
    }
    return {
        ok: true,
        result: {
            content,
            model,
            usage: json?.usage
                ? { prompt_tokens: json.usage.input_tokens, completion_tokens: json.usage.output_tokens }
                : undefined,
        },
    };
}

async function callModel(
    model: string,
    messages: ChatMessage[],
    signal: AbortSignal,
    maxTokens: number | undefined,
): Promise<{ ok: true; result: OpenRouterResult } | { ok: false; status: number; retryable: boolean }> {
    // Premium Claude models go DIRECT to the Anthropic API (funded), bypassing
    // OpenRouter entirely. Anthropic requires a max_tokens, so default it.
    if (isAnthropicModel(model)) {
        return callAnthropic(model, messages, signal, maxTokens ?? 4096);
    }

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
            // Caller-controlled output cap (always a number here). The analyze
            // route keeps it small; the generators pass a generous bound so a
            // long JSON array isn't truncated. We never omit it — OpenRouter
            // would otherwise assume the model max and 402 paid requests.
            ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
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
    opts: { deadlineMs?: number; maxTokens?: number; skip?: Set<string> } = {},
): Promise<OpenRouterResult> {
    // Output token cap. Default 500 keeps the analyze route cheap. Pass
    // `maxTokens: 0` for "uncapped" — we send a generous bound (16000) rather
    // than omitting the field, because (a) Anthropic REQUIRES max_tokens and
    // (b) omitting it makes OpenRouter assume the model max (65536) and reject
    // paid requests up front with a 402. Anthropic bills only the tokens it
    // actually emits, so a high ceiling never costs more than the real output.
    // The quiz/flashcard generators use this so a long JSON array isn't
    // truncated. Otherwise floor at 256, ceil at 8000.
    const UNCAPPED_MAX_TOKENS = 16000;
    const maxTokens =
        opts.maxTokens === 0
            ? UNCAPPED_MAX_TOKENS
            : Math.min(8000, Math.max(256, opts.maxTokens ?? 500));
    // Accept either an explicit model chain or a tier (back-compat).
    const fullChain: readonly string[] = Array.isArray(chainOrTier)
        ? chainOrTier
        : chainOrTier === "premium"
          ? PREMIUM_MODEL_CHAIN
          : FREE_MODEL_CHAIN;

    // Per-REQUEST skip set: a model that hard rate-limits (429) is throttled
    // for a while, so retrying it again in the SAME user request just wastes
    // the free-tier daily request cap (and cascades into the basic fallback).
    // Callers that fan out across many chunks pass ONE shared set so a model
    // that 429'd on chunk 1 isn't re-hit on chunks 2..N. This is what collapses
    // a worst case of dozens of requests per generate down to a handful.
    const skip = opts.skip ?? new Set<string>();
    const chain = fullChain.filter((m) => !skip.has(m));
    // Everything in this chain is already throttled — surface that immediately
    // rather than spinning passes against a wall.
    if (chain.length === 0) {
        throw new AllModelsFailedError(429);
    }

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
                if (skip.has(model)) continue; // throttled earlier this request
                if (Date.now() - startedAt > DEADLINE_MS) {
                    throw new AllModelsFailedError(lastStatus || 503);
                }
                try {
                    const r = await callModel(model, messages, controller.signal, maxTokens);
                    if (r.ok) return r.result;
                    lastStatus = r.status;
                    // A 429 means this model is throttled for a while — don't
                    // burn more of the daily request cap retrying it this pass
                    // OR on later chunks in the same request. Other retryable
                    // statuses (5xx / empty) can still be retried.
                    if (r.status === 429) {
                        skip.add(model);
                    } else if (r.retryable) {
                        sawRetryable = true;
                    }
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