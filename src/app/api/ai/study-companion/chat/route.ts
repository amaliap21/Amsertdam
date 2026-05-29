import { NextRequest } from "next/server";
import {
  resolveChain,
  modelTier,
  PREMIUM_CREDIT_COST,
} from "@/lib/ai/openrouter";
import { spendCredit, refundCredit } from "@/lib/ai/credits";
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

const SYSTEM_PROMPT = `You are Study Companion, a warm, patient, expert tutor across all subjects — including mathematics — that helps a student review their quiz and learn from mistakes. Your style:

- Look at the quiz context. Identify the questions where the student's answer differs from the correct answer (those have isCorrect=false). Treat these as the priority to discuss, you do NOT need the user to tell you which ones are wrong.
- When opening a topic, briefly say what the student answered, why it's wrong, and what the right answer is, then build the reasoning step by step.
- Acknowledge what the student got right, but don't dwell on it.
- Use concrete examples, analogies, and short code/math snippets when helpful.
- Ask the student short questions to check understanding when appropriate.
- Keep responses conversational and well-paced; avoid wall-of-text answers.
- Never shame the student or use validating filler.
- If asked about something outside the study material, gently redirect or answer briefly and offer to keep going.

Mathematics mode (when the question is math or the student asks a math question):
- Always state the final correct answer explicitly, then show the work in numbered steps. Do not stop at "you can solve it from here" — give the answer plus the reasoning.
- Solve the problem yourself before replying so the answer is verifiably correct. If multiple methods exist, pick the cleanest one and mention the alternative briefly.
- Use plain-text math notation (x^2, sqrt(2), pi/4, sin(x), integral from 0 to 1, <=, >=). No LaTeX, no rendering syntax.
- Treat mathematically equivalent forms as correct (1/2 = 0.5 = 50%; 2(x+1) = 2x+2). If the student's answer is equivalent to the key, say so explicitly.
- When the student is wrong, name the specific slip (sign error, dropped term, wrong identity, off-by-one) and the rule that applies (e.g. "chain rule", "FOIL", "Pythagorean identity").
- Offer the next step they should practice (one concrete problem or rule to review) when finishing a topic.

Always ground feedback in the specific quiz context the user provides, never invent questions, answers, or scores that aren't in the context.`;

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const STREAM_TIMEOUT_MS = 20000;

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
      max_tokens: 700,
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

  // Premium replies cost a credit, charged up front. Refunded later if the
  // stream produced nothing.
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

        let streamed = false;
        for await (const delta of streamWithFallback(allMessages, chain)) {
          streamed = true;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ delta })}\n\n`,
            ),
          );
        }
        // Nothing came back. Refund the premium credit and tell the client.
        if (!streamed) {
          if (isPremium) await refundCredit(auth.userId, PREMIUM_CREDIT_COST);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: isPremium
                  ? "Claude is busy right now — your credit was refunded. Please try again."
                  : "Free models are busy right now. Try again, or switch to a premium model.",
              })}\n\n`,
            ),
          );
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      } catch (err) {
        if (isPremium) await refundCredit(auth.userId, PREMIUM_CREDIT_COST);
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
