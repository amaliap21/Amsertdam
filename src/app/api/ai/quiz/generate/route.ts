import { NextRequest, NextResponse } from "next/server";
import { extractTextFromUpload } from "@/lib/upload-text";
import { requireUserId } from "@/lib/get-user-id";
import {
  extractQuiz,
  estimateMaxQuestions,
  type Language,
} from "@/lib/python-ports/quiz-extractor";
import { AI_USE_LLM } from "@/lib/ai/config";
import { generateQuizWithProviders } from "@/lib/ai/provider-router";
import { splitTextIntoChunks } from "@/lib/ai/splitter";
import { aggregateQuizResults } from "@/lib/ai/aggregator";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// Quiz generation, NO AI, NO external APIs. Inline TypeScript port of the
// Python extractor so the route works in `next dev` without a Python deploy.

function tidyText(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const title = (formData.get("title") as string) || "Untitled Quiz";
    const course = (formData.get("course") as string) || "";
    const mode = (formData.get("mode") as string) || "generate";
    const requestedQuestionsRaw = Number(formData.get("requestedQuestions") ?? 0);
    const langRaw = String(formData.get("language") ?? "en").toLowerCase();
    const language: Language = langRaw === "id" ? "id" : "en";

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' in form data" },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds the 50 MB limit." },
        { status: 413 },
      );
    }
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    const isTxt =
      file.type === "text/plain" ||
      file.name.toLowerCase().endsWith(".txt");
    if (!isPdf && !isTxt) {
      return NextResponse.json(
        {
          error:
            "Quiz Lab only accepts PDF or .txt files. For image-based study, use Flashcards instead.",
        },
        { status: 415 },
      );
    }

    const extracted = await extractTextFromUpload(file);
    const cleaned = tidyText(extracted.text);
    if (cleaned.length < 40 || extracted.wordCount < 30) {
      return NextResponse.json(
        {
          error:
            "Could not extract enough readable text from this file. Try a text-based PDF (not a scan) or a .txt file with more content.",
          extractedChars: cleaned.length,
          extractedWords: extracted.wordCount,
        },
        { status: 422 },
      );
    }

    const maxQuestions = estimateMaxQuestions(cleaned);

    if (mode === "analyze") {
      return NextResponse.json({
        title,
        course,
        maxQuestions,
        pageCount: extracted.pageCount ?? null,
        wordCount: extracted.wordCount,
      });
    }

    const requested = Number.isFinite(requestedQuestionsRaw) ? requestedQuestionsRaw : 0;
    const effective = requested > 0 ? Math.min(requested, maxQuestions) : maxQuestions;
    // Try LLM-based generation first (if enabled). Fall back to deterministic extractor.
    let questions: any[] = [];
    if (AI_USE_LLM) {
      const CHUNK_SIZE = Number(process.env.AI_CHUNK_SIZE || 4000);
      const CHUNK_OVERLAP = Number(process.env.AI_CHUNK_OVERLAP || 200);
      const threshold = CHUNK_SIZE * 1; // if text longer than chunk size, split
      try {
        const chunks = cleaned.length > threshold ? splitTextIntoChunks(cleaned, CHUNK_SIZE, CHUNK_OVERLAP) : [cleaned];
        const perChunk = Math.max(1, Math.ceil(effective / chunks.length));
        const parts: any[][] = [];
        for (const chunk of chunks) {
          const system = `You are a concise assistant. Respond ONLY with a single valid JSON object matching: {"questions":[{"prompt":"...","options":[{"letter":"A","text":"..."}],"correctAnswer":"A"}]}. Produce up to ${perChunk} questions derived from the provided source text. Keep options plausible and the correct answer grounded in the source.`;
          const user = `Source text:\n${chunk}\n\nReturn up to ${perChunk} multiple-choice questions.`;
          try {
            const result = await generateQuizWithProviders([
              { role: "system", content: system },
              { role: "user", content: user },
            ]);
            if (result.ok && result.payload?.questions?.length) {
              parts.push(result.payload.questions);
            }
          } catch {
            // ignore chunk-level failures
          }
          if (parts.flat().length >= effective) break;
        }
        if (parts.length > 0) {
          questions = aggregateQuizResults(parts, Math.max(1, effective));
        }
      } catch {
        // fall back to extractor below
      }
    }

    if (!questions || questions.length === 0) {
      questions = extractQuiz(cleaned, Math.max(1, effective), 0, language);
    }

    if (questions.length === 0) {
      return NextResponse.json(
        {
          error:
            "The text was too short or didn't contain enough distinct terms to build multiple-choice questions. Try a denser document (each question needs at least 4 distinct vocabulary words to fill A/B/C/D).",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      title,
      course,
      source: file.name,
      questions,
      maxQuestions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
