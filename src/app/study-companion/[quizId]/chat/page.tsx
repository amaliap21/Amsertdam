"use client";

import Link from "next/link";
import { ArrowLeft, Send, Sparkles, Trash2 } from "lucide-react";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useQuizById } from "@/lib/quiz-data";
import { modelTier } from "@/lib/ai/openrouter";
import ModelPicker, { DEFAULT_MODEL_ID } from "@/components/ui/model-picker";
import { useStore } from "@/store/use-store";
import { useAiAnalyze } from "@/lib/use-ai-analyze";
import type { ChatMessage as Message } from "@/store/use-store";

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

// Convert LaTeX/TeX math into readable plain text. The model is told to write
// plain-text math, but Claude often slips into LaTeX for equations — which
// renders as unreadable raw "\[ \frac{a}{b} \]" in a plain chat bubble. This
// normalizes the common constructs so the math stays legible regardless.
function texToPlain(input: string): string {
  let s = input;
  // Drop math-mode delimiters, keep the inner content.
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, "$1"); // $$ ... $$
  s = s.replace(/\\\[|\\\]|\\\(|\\\)/g, " "); // \[ \] \( \)
  s = s.replace(/\$([^$\n]+)\$/g, "$1"); // $ ... $
  // Resolve superscripts/subscripts FIRST so their braces don't break the
  // \frac / \boxed matchers below: x^{n} -> x^n (single char) or x^(n+1).
  s = s.replace(/([\^_])\{([^{}]+)\}/g, (_m, op, inner) =>
    inner.length === 1 ? `${op}${inner}` : `${op}(${inner})`,
  );
  // Peel \sqrt{...} -> sqrt(...) and \frac{a}{b} -> (a)/(b) together, a few
  // passes, so nesting in either direction (frac-in-sqrt or sqrt-in-frac,
  // e.g. the quadratic formula) resolves one level per pass.
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "sqrt($1)");
    s = s.replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
    if (s === before) break;
  }
  // Wrappers — run after \frac/\sqrt so nested content inside is already plain.
  s = s.replace(/\\(?:boxed|text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, "$1");
  // Operators / symbols.
  s = s
    .replace(/\\int/g, "∫")
    .replace(/\\sum/g, "Σ")
    .replace(/\\cdot/g, "·")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\infty/g, "∞")
    .replace(/\\leq/g, "<=")
    .replace(/\\geq/g, ">=")
    .replace(/\\neq/g, "≠")
    .replace(/\\(?:Longrightarrow|Rightarrow|implies)/g, "=>")
    .replace(/\\to/g, "->")
    .replace(/\\(?:quad|qquad|,|;|:|!)/g, " ");
  // Spacing/sizing commands with no plain-text equivalent.
  s = s.replace(/\\(?:left|right|big|bigg|Big|Bigg|displaystyle)\b/g, "");
  // Any leftover "\command" -> keep the word (covers greek: \pi -> pi, etc.).
  s = s.replace(/\\([a-zA-Z]+)/g, "$1");
  // Stray braces left from grouping.
  s = s.replace(/[{}]/g, "");
  return s;
}

function renderMarkdown(content: string): React.ReactNode {
  const lines = texToPlain(content).split(/\r?\n/);
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
  const setChatSession = useStore((s) => s.setChatSession);
  const clearChatSession = useStore((s) => s.clearChatSession);
  // Refreshes the shared free/premium counters (shown in the navbar) after a
  // premium reply spends a credit.
  const { refresh: refreshUsage } = useAiAnalyze();

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
  const [streaming, setStreaming] = useState(false);
  const [chatModel, setChatModel] = useState(DEFAULT_MODEL_ID);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Gate persistence until we've loaded any saved transcript, so the initial
  // welcome-only render can't overwrite a stored conversation.
  const hydratedRef = useRef(false);

  // Hydrate the saved transcript once (client-only, to avoid an SSR mismatch).
  useEffect(() => {
    if (hydratedRef.current) return;
    const stored = useStore.getState().chatSessions[quizId];
    if (stored && stored.length > 0) {
      setMessages(stored);
    }
    hydratedRef.current = true;
  }, [quizId]);

  // Persist the transcript whenever it settles (not mid-stream). A chat that's
  // only the welcome message isn't worth saving — clearing it removes the
  // stored entry entirely so a deleted chat stays deleted.
  useEffect(() => {
    if (!hydratedRef.current || streaming) return;
    const hasConversation = messages.some((m) => m.id !== "welcome");
    if (hasConversation) setChatSession(quizId, messages);
    else clearChatSession(quizId);
  }, [messages, streaming, quizId, setChatSession, clearChatSession]);

  // If the attempt loads after first render (e.g. from persisted store), refresh
  // the welcome message so the AI's opener reflects the real score.
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 0 || prev[0].id !== "welcome") return prev;
      if (prev[0].content === welcomeContent) return prev;
      return [{ ...prev[0], content: welcomeContent }, ...prev.slice(1)];
    });
  }, [welcomeContent]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleClearChat = () => {
    if (
      typeof window !== "undefined" &&
      messages.some((m) => m.id !== "welcome") &&
      !window.confirm("Delete this chat? This can't be undone.")
    ) {
      return;
    }
    clearChatSession(quizId);
    setMessages([{ id: "welcome", role: "assistant", content: welcomeContent }]);
  };

  const sendMessage = async (raw: string) => {
    const trimmed = raw.trim();
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
      // Every reply spends a unit server-side (premium uses 1 credit, free uses
      // 1 daily-quota unit), so refresh both navbar counters without a reload.
      refreshUsage();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
    setInput("");
  };

  // Immersive, Socratic quick prompts. Tapping one sends it straight away so
  // learning feels interactive and guided rather than a blank text box.
  const SOCRATIC_CHIPS = [
    "Quiz me with multiple-choice options",
    "Give me a hint, do not reveal the answer",
    "Explain this step by step",
    "Ask me a question to check my understanding",
    "Let's discuss why my answer was wrong",
  ];

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
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleClearChat}
            disabled={streaming}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-primary transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 size={12} />
            Delete chat
          </button>
          <span className="flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-primary text-xs font-medium rounded-full">
            <Sparkles size={12} />
            Powered by AI
          </span>
        </div>
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
        {/* Immersive Socratic quick prompts */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {SOCRATIC_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => void sendMessage(chip)}
              disabled={streaming}
              className="flex items-center gap-1 whitespace-nowrap rounded-full border border-indigo-primary/40 px-3 py-1 text-xs font-medium text-indigo-primary transition hover:bg-indigo-primary/5 disabled:opacity-50"
            >
              <Sparkles size={12} /> {chip}
            </button>
          ))}
        </div>
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
            Premium model, each reply uses 1 credit.
          </p>
        )}
      </form>
    </div>
  );
}
