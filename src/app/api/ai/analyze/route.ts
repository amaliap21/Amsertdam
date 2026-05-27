import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/get-user-id";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
    chatWithFallback,
    AllModelsFailedError,
    PREMIUM_CREDIT_COST,
    modelTier,
    resolveChain,
    type Tier,
} from "@/lib/ai/openrouter";
import { burstLimiter, consumeQuota, refundQuota, peekQuota } from "@/lib/ai/limits";
import { getCredits, spendCredit, refundCredit } from "@/lib/ai/credits";
import { cacheKey, getCached, setCached } from "@/lib/ai/cache";
import { SYSTEM_PROMPT, buildUserMessage, parseAnalysis } from "@/lib/ai/prompt";

export const runtime = "nodejs"; // crypto + fetch; not edge
// Give the retry-with-backoff chain room to ride out transient 429s without
// hitting the function timeout. Vercel allows up to 60s; 30s is plenty.
export const maxDuration = 30;

export async function POST(req: Request) {
    const auth = await requireUserId();
    if (auth.response) return auth.response;
    const { userId } = auth;

    // 1. Spam guard — per user AND per IP. The IP check bounds an
    //    attacker who rotates accounts; the user check bounds a single
    //    account hammering the endpoint. Either tripping → 429.
    const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";
    const [userBurst, ipBurst] = await Promise.all([
        burstLimiter.limit(`u:${userId}`),
        burstLimiter.limit(`ip:${ip}`),
    ]);
    if (!userBurst.success || !ipBurst.success) {
        return NextResponse.json(
            { error: "You're going too fast. Wait a few seconds and try again." },
            { status: 429 },
        );
    }

    // 2. Validate input.
    const body = await req.json().catch(() => ({}));
    const question = String(body.question ?? "").trim();
    const userAnswer = String(body.userAnswer ?? "").trim();
    const correctAnswer = String(body.correctAnswer ?? "").trim().slice(0, 2000);
    const subject = String(body.subject ?? "").trim().slice(0, 80);

    // The user may pick a specific model. If they do, the billing tier is
    // DERIVED from that model (so a premium model always bills premium and a
    // free model never does), and we validate it against the allowed list.
    // Falls back to the legacy `tier` field when no model is given.
    const requestedModel =
        typeof body.model === "string" ? body.model : undefined;
    const modelTierForRequest = requestedModel ? modelTier(requestedModel) : null;
    if (requestedModel && !modelTierForRequest) {
        return NextResponse.json({ error: "Unknown model." }, { status: 400 });
    }
    const tier: Tier =
        modelTierForRequest ?? (body.tier === "premium" ? "premium" : "free");

    if (!question || !userAnswer) {
        return NextResponse.json({ error: "Question and answer are required." }, { status: 400 });
    }
    if (question.length > 2000 || userAnswer.length > 2000) {
        return NextResponse.json({ error: "Input too long (max 2000 chars)." }, { status: 400 });
    }

    // 3. Cache lookup BEFORE spending anything — cached hits are free.
    //    EVERY cache entry is scoped to the requesting user (the key
    //    includes userId). No analysis result is ever shared between
    //    users — one user can never receive anything derived from another
    //    user's request, free or premium. The cache only ever returns a
    //    result for input THIS user submitted.
    const key = cacheKey(
        subject,
        question,
        `${tier}|u:${userId}|${correctAnswer}|${userAnswer}`,
    );
    const cached = await getCached(key);
    if (cached) {
        return NextResponse.json({
            analysis: cached,
            cached: true,
            tier,
            remaining: await peekQuota(userId),
            credits: await getCredits(userId),
        });
    }

    // 4. Spend the right "currency": a durable credit for premium, the
    //    daily quota for free.
    let spentCredit = false;
    let remaining = await peekQuota(userId);
    let credits = await getCredits(userId);

    if (tier === "premium") {
        const newBalance = await spendCredit(userId, PREMIUM_CREDIT_COST);
        if (newBalance === null) {
            return NextResponse.json(
                {
                    error: `Not enough premium credits (this analysis costs ${PREMIUM_CREDIT_COST}). Buy a credit pack to use Claude analysis.`,
                    needsCredits: true,
                    cost: PREMIUM_CREDIT_COST,
                    credits,
                },
                { status: 402 }, // Payment Required
            );
        }
        spentCredit = true;
        credits = newBalance;
    } else {
        const left = await consumeQuota(userId);
        if (left === null) {
            return NextResponse.json(
                {
                    error: "Daily free limit reached (resets at midnight UTC). Use a Premium credit for instant Claude analysis.",
                    remaining: 0,
                    quotaExceeded: true,
                    credits,
                },
                { status: 429 },
            );
        }
        remaining = left;
    }

    // Refund whichever currency we spent, on any failure path.
    const refund = async () => {
        if (spentCredit) await refundCredit(userId, PREMIUM_CREDIT_COST);
        else await refundQuota(userId);
    };

    // 5. AI call (premium → Claude chain, free → free chain).
    try {
        const result = await chatWithFallback(
            [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: buildUserMessage({
                        subject,
                        question,
                        userAnswer,
                        correctAnswer: correctAnswer || undefined,
                    }),
                },
            ],
            // Chosen model first, then same-tier fallbacks for reliability.
            resolveChain(requestedModel, tier),
        );

        const analysis = parseAnalysis(result.content);
        if (!analysis) {
            await refund();
            return NextResponse.json(
                { error: "The AI returned an unexpected format. Please try again." },
                { status: 502 },
            );
        }

        await setCached(key, analysis);

        // 6. Persist (fire-and-forget; never block the response on the DB).
        void supabaseAdmin.from("ai_analyses").insert({
            user_id: userId,
            subject: subject || null,
            question,
            user_answer: userAnswer,
            verdict: analysis.verdict,
            result: analysis,
            model_used: result.model,
            cached: false,
            tokens_prompt: result.usage?.prompt_tokens ?? null,
            tokens_completion: result.usage?.completion_tokens ?? null,
        });

        return NextResponse.json({ analysis, cached: false, tier, remaining, credits });
    } catch (err) {
        await refund();
        const credBack = spentCredit ? credits + PREMIUM_CREDIT_COST : credits;
        const quotaBack = spentCredit ? remaining : remaining + 1;
        if (err instanceof AllModelsFailedError) {
            // For free-tier failures, nudge toward premium (which doesn't
            // share the flaky free rate limits).
            const error =
                tier === "free"
                    ? `${err.message} Tip: Premium (Claude) credits skip the free-model queues.`
                    : err.message;
            return NextResponse.json(
                { error, remaining: quotaBack, credits: credBack },
                { status: 503 },
            );
        }
        return NextResponse.json(
            { error: "Analysis failed. Please try again.", remaining: quotaBack, credits: credBack },
            { status: 500 },
        );
    }
}

// Lightweight peek for showing "N free left" + "M credits" on page load.
export async function GET() {
    const auth = await requireUserId();
    if (auth.response) return auth.response;
    const [remaining, credits] = await Promise.all([
        peekQuota(auth.userId),
        getCredits(auth.userId),
    ]);
    return NextResponse.json({ remaining, credits });
}