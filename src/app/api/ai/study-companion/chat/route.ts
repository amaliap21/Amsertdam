import { NextRequest } from "next/server";
import { streamClaude } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

type Body = {
  messages: ChatMessage[];
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

const SYSTEM_PROMPT = `You are Study Companion — a warm, patient, expert tutor that helps a student review their quiz and learn from mistakes. Your style:

- Look at the quiz context. Identify the questions where the student's answer differs from the correct answer (those have isCorrect=false). Treat these as the priority to discuss — you do NOT need the user to tell you which ones are wrong.
- When opening a topic, briefly say what the student answered, why it's wrong, and what the right answer is — then build the reasoning step by step.
- Acknowledge what the student got right, but don't dwell on it.
- Use concrete examples, analogies, and short code/math snippets when helpful.
- Ask the student short questions to check understanding when appropriate.
- Keep responses conversational and well-paced; avoid wall-of-text answers.
- Never shame the student or use validating filler.
- If asked about something outside the study material, gently redirect or answer briefly and offer to keep going.

Always ground feedback in the specific quiz context the user provides — never invent questions, answers, or scores that aren't in the context.`;

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

  const contextText = formatContext(body.context);
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  if (contextText) {
    messages.push({
      role: "user",
      content: `Here is the quiz context I'm reviewing with you:\n\n${contextText}`,
    });
    messages.push({
      role: "assistant",
      content: "Got it — I have the quiz context. What would you like to dig into?",
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

        for await (const delta of streamClaude(allMessages)) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ delta })}\n\n`,
            ),
          );
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      } catch (err) {
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
