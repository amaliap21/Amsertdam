import { NextRequest } from "next/server";
import {
  resolveChain,
  modelTier,
  PREMIUM_CREDIT_COST,
  PREMIUM_MODEL_CHAIN,
} from "@/lib/ai/openrouter";
import { streamClaude } from "@/lib/anthropic";
import { spendCredit, refundCredit } from "@/lib/ai/credits";
import { consumeQuota, refundQuota } from "@/lib/ai/limits";
import { requireUserId } from "@/lib/get-user-id";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

type Body = {
  messages: ChatMessage[];
  /** Chosen model id (from MODEL_OPTIONS). Premium models charge a credit
   *  per reply; free models are free. */
  model?: string;
  context?: {
    quizTitle?: string;
    course?: string;
    score?: string;
    questions?: {
      prompt: string;
      userAnswer?: string;
      correctAnswer?: string;
      isCorrect?: boolean;
    }[];
  };
};

const SYSTEM_PROMPT = `You are Study Companion, a warm, patient, expert tutor across all subjects, including mathematics, that helps a student review their quiz and learn from mistakes. Your style:

- Look at the quiz context. Identify the questions where the student's answer differs from the correct answer (those have isCorrect=false). Treat these as the priority to discuss, you do NOT need the user to tell you which ones are wrong.
- When opening a topic, briefly say what the student answered, why it's wrong, and what the right answer is, then build the reasoning step by step.
- Acknowledge what the student got right, but don't dwell on it.
- Use concrete examples, analogies, and short code/math snippets when helpful.
- Ask the student short questions to check understanding when appropriate.
- Keep responses conversational and well-paced; avoid wall-of-text answers.
- Never shame the student or use validating filler.
- If asked about something outside the study material, gently redirect or answer briefly and offer to keep going.

Tutoring approach (how you teach, apply these throughout every reply):
- The art of holding back: don't dump the whole solution at once. Reveal one idea or step at a time, leave the student room to think, and invite them to attempt the next move before you continue. Resist the urge to solve everything immediately. This holds EVEN when the student says "show me how", "step by step", or "how do I solve this", read that as "guide me", NOT "give me the finished solution". Give only the FIRST step (or a hint toward it), then stop and ask the student to try the next step themselves. Reveal later steps one at a time as they respond. Only lay out the complete worked solution end-to-end if they have genuinely attempted it and are stuck, or they explicitly say something like "just give me the full answer". One short step per message, never a numbered list of every step in a single reply.
- Scaffolding, not spoon-feeding: give hints, partial structure, and leading cues that move the student toward the answer themselves. Start with the smallest nudge that could unblock them and add more only if they're still stuck, build a ladder, don't carry them up it.
- Strategic questioning to prompt metacognition: ask questions that make the student examine their own thinking, not just produce an answer ("What led you to that choice?", "How could you check whether that's right?", "Which step feels shakiest to you?"). Target the reasoning process so they learn how to catch their own mistakes.
- Surfacing misconceptions safely: when you spot a faulty mental model, name it plainly and without judgment, treat it as a normal and useful part of learning, and guide the student to test it against a concrete example so they see the gap for themselves. Never make them feel foolish for having held it.

Mathematics mode (when the question is math or the student asks a math question):
- Always work out the correct answer yourself first so you know where you're guiding the student, but do NOT reveal the whole solution upfront. Walk them through it ONE step at a time, pausing after each step to let them attempt or confirm the next. Give the complete worked answer only after they've engaged with the steps, or if they're stuck after trying, or if they explicitly ask for the full answer. Never abandon them with a vague "you can figure it out", guiding still always ends in a clear, correct resolution, just not all in one message.
- Solve the problem yourself before replying so the answer is verifiably correct. If multiple methods exist, pick the cleanest one and mention the alternative briefly.
- Write ALL math as plain text, NEVER LaTeX or markdown math. Do NOT use \\( \\) \\[ \\] $...$ $$...$$, and do NOT use backslash commands like \\frac, \\int, \\sqrt, \\boxed, \\cdot, \\left, \\right, or \\text. Write fractions as a/b, powers as x^2, subscripts as x_1, roots as sqrt(x), integrals as ∫ or "integral of", multiplication as * or ×, and inequalities as <= >=. For example write "∫ 2x(x^2+3)^4 dx" and "(x^2+3)^5 / 5 + C", NOT "\\int 2x(x^2+3)^4\\,dx" or "\\frac{(x^2+3)^5}{5}". Keep formatting simple, short paragraphs and at most short bullet lists; avoid big markdown tables, they don't render well in the chat bubble.
- Treat mathematically equivalent forms as correct (1/2 = 0.5 = 50%; 2(x+1) = 2x+2). If the student's answer is equivalent to the key, say so explicitly.
- When the student is wrong, name the specific slip (sign error, dropped term, wrong identity, off-by-one) and the rule that applies (e.g. "chain rule", "FOIL", "Pythagorean identity").
- Offer the next step they should practice (one concrete problem or rule to review) when finishing a topic.

Always ground feedback in the specific quiz context the user provides, never invent questions, answers, or scores that aren't in the context.`;

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const STREAM_TIMEOUT_MS = 20000;
// Generous output ceiling so replies aren't cut off mid-sentence. Anthropic
// REQUIRES max_tokens (can't be omitted) but bills only the tokens it actually
// emits, so a high cap is free headroom; a chat reply almost never approaches
// this. The old 700 was truncating longer step-by-step explanations.
const CHAT_MAX_TOKENS = 128000;

async function fetchOpenRouterStream(
  model: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  signal: AbortSignal,
): Promise<Response> {
  return fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_APP_URL ?? "http://localhost:3000",
      "X-Title": "RealTrack Study Companion",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: CHAT_MAX_TOKENS,
      stream: true,
    }),
  });
}

async function* streamOpenRouterResponse(resp: Response): AsyncGenerator<string> {
  if (!resp.body) return;
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const dataLine = event
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield delta;
        }
      } catch {
        // skip malformed events
      }
    }
  }
}

// Streams over the given chain. NO automatic Claude fallback: premium
// models (Opus) cost money and are only reached when the caller has spent a
// credit and passed the premium chain. Free callers get only free models.
async function* streamWithFallback(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  chain: readonly string[],
): AsyncGenerator<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return;
    for (const model of chain) {
      try {
        const resp = await fetchOpenRouterStream(model, messages, controller.signal);
        if (resp.status === 429 || resp.status >= 500) continue;
        if (!resp.ok || !resp.body) continue;

        let didYield = false;
        for await (const delta of streamOpenRouterResponse(resp)) {
          didYield = true;
          yield delta;
        }
        if (didYield) return;
      } catch {
        // try next model in the chain
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

function formatContext(ctx: Body["context"]): string | null {
  if (!ctx) return null;
  const lines: string[] = [];
  if (ctx.quizTitle) lines.push(`Quiz: ${ctx.quizTitle}`);
  if (ctx.course) lines.push(`Course: ${ctx.course}`);
  if (ctx.score) lines.push(`Score: ${ctx.score}`);
  if (ctx.questions && ctx.questions.length) {
    lines.push("Questions:");
    ctx.questions.forEach((q, i) => {
      lines.push(`  ${i + 1}. ${q.prompt}`);
      if (q.userAnswer) lines.push(`     User answered: ${q.userAnswer}`);
      if (q.correctAnswer) lines.push(`     Correct: ${q.correctAnswer}`);
      if (typeof q.isCorrect === "boolean")
        lines.push(`     Result: ${q.isCorrect ? "correct" : "incorrect"}`);
    });
  }
  return lines.length ? lines.join("\n") : null;
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "Missing messages" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Resolve model + billing tier. Validate any explicit model.
  const requestedModel =
    typeof body.model === "string" ? body.model : undefined;
  const tier = requestedModel ? modelTier(requestedModel) : "free";
  if (requestedModel && !tier) {
    return new Response(JSON.stringify({ error: "Unknown model" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const isPremium = tier === "premium";

  // Every reply costs ONE unit, charged up front and refunded if the stream
  // produces nothing: a premium reply spends 1 durable credit, a free reply
  // spends 1 unit of the daily free quota. Free chat is no longer unlimited.
  if (isPremium) {
    const balance = await spendCredit(auth.userId, PREMIUM_CREDIT_COST);
    if (balance === null) {
      return new Response(
        JSON.stringify({
          error:
            "You have no premium credits left. Buy a pack to chat with Claude Opus.",
          needsCredits: true,
        }),
        { status: 402, headers: { "content-type": "application/json" } },
      );
    }
  } else {
    const left = await consumeQuota(auth.userId);
    if (left === null) {
      return new Response(
        JSON.stringify({
          error:
            "Daily free limit reached (resets at midnight UTC). Use a premium credit to keep chatting with Claude.",
          quotaExceeded: true,
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }
  }
  const chain = resolveChain(requestedModel, isPremium ? "premium" : "free");

  const contextText = formatContext(body.context);
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  if (contextText) {
    messages.push({
      role: "user",
      content: `Here is the quiz context I'm reviewing with you:\n\n${contextText}`,
    });
    messages.push({
      role: "assistant",
      content: "Got it, I have the quiz context. What would you like to dig into?",
    });
  }
  messages.push(...body.messages);

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      try {
        // Add system message to start
        const allMessages = [
          { role: "system" as const, content: SYSTEM_PROMPT },
          ...messages,
        ];

        // Premium → stream DIRECTLY from the funded Anthropic API (not the
        // unfunded OpenRouter account). Free → OpenRouter free-model chain.
        const deltaSource = isPremium
          ? streamClaude(allMessages, {
              // No `temperature` — newer Claude models reject it and 400.
              model: (requestedModel ?? PREMIUM_MODEL_CHAIN[0]).replace(
                /^anthropic\//,
                "",
              ),
              maxTokens: CHAT_MAX_TOKENS,
            })
          : streamWithFallback(allMessages, chain);

        let streamed = false;
        for await (const delta of deltaSource) {
          streamed = true;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ delta })}\n\n`,
            ),
          );
        }
        // Nothing came back. Refund the unit (credit or free quota) and tell
        // the client.
        if (!streamed) {
          if (isPremium) await refundCredit(auth.userId, PREMIUM_CREDIT_COST);
          else await refundQuota(auth.userId);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: isPremium
                  ? "Claude is busy right now, your credit was refunded. Please try again."
                  : "Free models are busy right now. Try again, or switch to a premium model.",
              })}\n\n`,
            ),
          );
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      } catch (err) {
        if (isPremium) await refundCredit(auth.userId, PREMIUM_CREDIT_COST);
        else await refundQuota(auth.userId);
        const message = err instanceof Error ? err.message : "stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
