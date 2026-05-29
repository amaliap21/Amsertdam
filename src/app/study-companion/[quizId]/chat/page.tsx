"use client";

import Link from "next/link";
import { ArrowLeft, Send, Sparkles } from "lucide-react";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useQuizById } from "@/lib/quiz-data";
import { modelTier } from "@/lib/ai/openrouter";
import ModelPicker, { DEFAULT_MODEL_ID } from "@/components/ui/model-picker";
import { useStore } from "@/store/use-store";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

// Inline-format a single line: **bold**, *italic*, _italic_, `code`.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  // Order matters: code first (so its contents aren't re-parsed), then bold, then italics.
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const m = match[0];
    const key = `${keyBase}-${i++}`;
    if (m.startsWith("`") && m.endsWith("`")) {
      tokens.push(
        <code
          key={key}
          className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[0.85em]"
        >
          {m.slice(1, -1)}
        </code>,
      );
    } else if (m.startsWith("**") && m.endsWith("**")) {
      tokens.push(
        <strong key={key} className="font-semibold">
          {m.slice(2, -2)}
        </strong>,
      );
    } else if (m.startsWith("*") && m.endsWith("*")) {
      tokens.push(<em key={key}>{m.slice(1, -1)}</em>);
    } else if (m.startsWith("_") && m.endsWith("_")) {
      tokens.push(<em key={key}>{m.slice(1, -1)}</em>);
    }
    lastIndex = match.index + m.length;
  }
  if (lastIndex < text.length) tokens.push(text.slice(lastIndex));
  return tokens;
}

function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;
  let blockKey = 0;

  const flushList = () => {
    if (!listBuffer) return;
    const { ordered, items } = listBuffer;
    const Tag = ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={`list-${blockKey++}`}
        className={
          ordered
            ? "list-decimal pl-5 space-y-1 my-1"
            : "list-disc pl-5 space-y-1 my-1"
        }
      >
        {items.map((item, idx) => (
          <li key={idx}>{renderInline(item, `li-${blockKey}-${idx}`)}</li>
        ))}
      </Tag>,
    );
    listBuffer = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bulletMatch = line.match(/^\s*[-*•]\s+(.*)$/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (bulletMatch) {
      if (!listBuffer || listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(bulletMatch[1]);
    } else if (numberedMatch) {
      if (!listBuffer || !listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(numberedMatch[1]);
    } else if (line.trim() === "") {
      flushList();
      blocks.push(<div key={`sp-${blockKey++}`} className="h-2" />);
    } else {
      flushList();
      blocks.push(
        <p key={`p-${blockKey++}`} className="leading-relaxed">
          {renderInline(line, `p-${blockKey}`)}
        </p>,
      );
    }
  }
  flushList();
  return <div className="space-y-1">{blocks}</div>;
}

const WELCOME_FALLBACK =
  "Hi! I'm your Study Companion. Tell me what you'd like to review, I can explain mistakes, walk through concepts, or quiz you on tricky parts. Where should we start?";

export default function StudyCompanionChat({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = use(params);
  const liveQuiz = useQuizById(quizId);
  const attempts = useStore((s) => s.attempts);

  // Latest attempt for this quiz (so the AI sees what the user actually answered).
  const attempt = useMemo(() => {
    const matching = attempts.filter((a) => a.quizId === quizId);
    if (matching.length === 0) return null;
    return matching.reduce((latest, a) =>
      new Date(a.completedAt) > new Date(latest.completedAt) ? a : latest,
    );
  }, [attempts, quizId]);

  // Study Companion is a live mirror of Quiz Lab, if the quiz no longer
  // exists, this entry shouldn't be reachable.
  const quiz = useMemo(() => {
    if (!liveQuiz) return null;
    return {
      title: liveQuiz.title,
      course: liveQuiz.course,
      questions: liveQuiz.questions,
    };
  }, [liveQuiz]);

  const wrongQuestions = useMemo(() => {
    if (!quiz || !attempt) return [] as { number: number; prompt: string }[];
    return quiz.questions
      .map((q, i) => ({
        number: i + 1,
        prompt: q.prompt,
        correct: attempt.answers?.[q.id] === q.correctAnswer,
        answered: Boolean(attempt.answers?.[q.id]),
      }))
      .filter((q) => !q.correct)
      .map((q) => ({ number: q.number, prompt: q.prompt }));
  }, [quiz, attempt]);

  const welcomeContent = useMemo(() => {
    if (!quiz) return WELCOME_FALLBACK;
    if (!attempt) {
      return `Hi! Let's review **${quiz.title}** for ${quiz.course}. Once you've taken the quiz I'll be able to walk through each answer with you. For now, ask me anything about the material.`;
    }
    if (wrongQuestions.length === 0) {
      return `Nice work on **${quiz.title}**, you got every question right (${attempt.correct}/${attempt.total}). Want me to push deeper on any concept or quiz you on related material?`;
    }
    const list = wrongQuestions
      .slice(0, 5)
      .map((q) => `- Q${q.number}: ${q.prompt}`)
      .join("\n");
    const more =
      wrongQuestions.length > 5
        ? `\n…and ${wrongQuestions.length - 5} more.`
        : "";
    return `You scored **${attempt.correct}/${attempt.total}** on **${quiz.title}**. Here are the ones you missed:\n\n${list}${more}\n\nWant me to start with **Q${wrongQuestions[0].number}**, or pick a different one?`;
  }, [quiz, attempt, wrongQuestions]);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "assistant", content: welcomeContent },
  ]);

  // If the attempt loads after first render (e.g. from persisted store), refresh
  // the welcome message so the AI's opener reflects the real score.
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 0 || prev[0].id !== "welcome") return prev;
      if (prev[0].content === welcomeContent) return prev;
      return [{ ...prev[0], content: welcomeContent }, ...prev.slice(1)];
    });
  }, [welcomeContent]);
  const [streaming, setStreaming] = useState(false);
  const [chatModel, setChatModel] = useState(DEFAULT_MODEL_ID);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const userMsg: Message = {
      id: `u_${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    const assistantId = `a_${Date.now()}`;
    const next: Message[] = [
      ...messages,
      userMsg,
      { id: assistantId, role: "assistant", content: "" },
    ];
    setMessages(next);
    setInput("");
    setStreaming(true);

    const apiMessages = next
      .filter((m) => m.id !== "welcome" && m.id !== assistantId)
      .map((m) => ({ role: m.role, content: m.content }));

    const context = quiz
      ? {
        quizTitle: quiz.title,
        course: quiz.course,
        score: attempt ? `${attempt.correct}/${attempt.total}` : undefined,
        questions: quiz.questions.map((q) => {
          const userLetter = attempt?.answers?.[q.id];
          const userOption = q.options.find((o) => o.letter === userLetter);
          const correctOption = q.options.find(
            (o) => o.letter === q.correctAnswer,
          );
          return {
            prompt: q.prompt,
            userAnswer: userOption
              ? `${userOption.letter}. ${userOption.text}`
              : userLetter
                ? userLetter
                : "(not answered)",
            correctAnswer: correctOption
              ? `${correctOption.letter}. ${correctOption.text}`
              : q.correctAnswer,
            isCorrect: Boolean(userLetter) && userLetter === q.correctAnswer,
          };
        }),
      }
      : undefined;

    try {
      const resp = await fetch("/api/ai/study-companion/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, context, model: chatModel }),
      });

      if (!resp.ok || !resp.body) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Chat failed (${resp.status})`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const event = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = event.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as
              | { delta: string }
              | { error: string };
            if ("delta" in parsed) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.delta }
                    : m,
                ),
              );
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `Sorry, ${parsed.error}` }
                    : m,
                ),
              );
            }
          } catch {
            // skip malformed event
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Sorry, ${message}` }
            : m,
        ),
      );
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5 flex flex-col">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8">
        <Link
          href="/study-companion"
          className="flex items-center gap-2 text-gray-primary hover:text-black-primary transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">Back to Study Companion</span>
        </Link>
        <span className="self-start sm:self-auto flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-primary text-xs font-medium rounded-full">
          <Sparkles size={12} />
          Powered by AI
        </span>
      </div>

      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-black-primary mb-2">
          Study Companion
        </h1>
        <p className="text-gray-primary">
          {quiz ? `Reviewing ${quiz.title}` : "Open AI study session"}
        </p>
      </div>

      <div className="flex-1 space-y-4 mb-8 pb-28 sm:pb-24">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
              }`}
          >
            <div
              className={`max-w-[85%] sm:max-w-2xl rounded-xl p-4 sm:p-5 text-sm break-words ${message.role === "user"
                  ? "bg-indigo-primary text-white whitespace-pre-line"
                  : "bg-white border border-gray-200 text-black-primary"
                }`}
            >
              {message.content ? (
                message.role === "assistant" ? (
                  renderMarkdown(message.content)
                ) : (
                  message.content
                )
              ) : (
                <span className="inline-flex gap-1 items-center text-gray-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse [animation-delay:120ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse [animation-delay:240ms]" />
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="fixed bottom-3 sm:bottom-6 left-3 right-3 sm:left-6 sm:right-6 lg:left-[calc(16rem+1rem)] lg:right-14.75 flex flex-col gap-1.5 bg-white border border-gray-200 rounded-2xl px-3 sm:px-4 py-2 shadow-md"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Pick the model. Premium (Opus) charges 1 credit per reply. */}
          <ModelPicker
            variant="compact"
            value={chatModel}
            onChange={setChatModel}
            disabled={streaming}
          />
          <div className="flex items-center gap-2 sm:flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={streaming ? "AI is typing…" : "Ask anything…"}
              disabled={streaming}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-black-primary placeholder:text-gray-primary disabled:opacity-50"
            />
            <button
              type="submit"
              className="flex items-center justify-center w-9 h-9 shrink-0 bg-indigo-primary text-white rounded-full hover:bg-indigo-600 transition-colors disabled:opacity-50"
              disabled={!input.trim() || streaming}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
        {modelTier(chatModel) === "premium" && (
          <p className="px-1 text-[10px] text-gray-primary">
            Premium model — each reply uses 1 credit.
          </p>
        )}
      </form>
    </div>
  );
}
