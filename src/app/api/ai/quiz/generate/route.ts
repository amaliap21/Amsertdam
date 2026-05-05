import { NextRequest, NextResponse } from "next/server";
import { callOllama, extractFirstJson } from "@/lib/ollama";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { extractTextFromUpload } from "@/lib/upload-text";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

type Letter = "A" | "B" | "C" | "D";

type RawQuestion = {
  prompt: string;
  options: { letter: Letter; text: string }[];
  correctAnswer: Letter;
};

function tidyText(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const title = (formData.get("title") as string) || "Untitled Quiz";
    const course = (formData.get("course") as string) || "";
    const mode = (formData.get("mode") as string) || "generate";
    const requestedQuestionsRaw = Number(formData.get("requestedQuestions") ?? 0);

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
    if (file.type.startsWith("image/")) {
      return NextResponse.json(
        {
          error:
            "Image OCR is not supported by the local model. Please upload a PDF or text file containing readable text.",
        },
        { status: 415 },
      );
    }

    const extracted = await extractTextFromUpload(file);
    const cleaned = tidyText(extracted.text);
    const total = cleaned.length;
    const windowSize = 12000;
    const start = total > windowSize * 1.5 ? Math.floor(total * 0.15) : 0;
    const filePreview = cleaned.substring(start, start + windowSize);
    if (filePreview.length < 40 || extracted.wordCount < 30) {
      return NextResponse.json(
        {
          error:
            "Could not extract enough readable text from this file. Try a text-based PDF (not a scan) or a .txt file.",
          extractedChars: filePreview.length,
          extractedWords: extracted.wordCount,
        },
        { status: 422 },
      );
    }

    const limitResponse = await callOllama(
      [
        {
          role: "system",
          content:
            'You estimate how many quiz questions a source can support. Respond with strict JSON only: {"maxQuestions": number}. Choose a realistic limit between 4 and 20.',
        },
        {
          role: "user",
          content: `Estimate the best quiz size for a quiz titled "${title}"${
            course ? ` in the course "${course}"` : ""
          }. Return JSON only.\n\nMATERIAL:\n${filePreview}`,
        },
      ],
      { jsonMode: true },
    );

    let maxQuestions = 8;
    try {
      const limitJson = extractFirstJson<{ maxQuestions?: number }>(limitResponse);
      const parsedLimit = Number(limitJson?.maxQuestions);
      if (Number.isFinite(parsedLimit)) {
        maxQuestions = Math.max(4, Math.min(20, Math.round(parsedLimit)));
      }
    } catch {
      const fallback = Math.round(filePreview.split(/\s+/).filter(Boolean).length / 60) || 8;
      maxQuestions = Math.max(4, Math.min(20, fallback));
    }

    if (mode === "analyze") {
      return NextResponse.json({
        title,
        course,
        maxQuestions,
        pageCount: extracted.pageCount ?? null,
        wordCount: extracted.wordCount,
      });
    }

    const effectiveQuestions = Number.isFinite(requestedQuestionsRaw)
      ? Math.max(1, Math.min(maxQuestions, Math.round(requestedQuestionsRaw)))
      : maxQuestions;

    const response = await callOllama(
      [
        {
          role: "system",
          content:
            'You are an expert educator. Write multiple-choice quiz questions. Respond with strict JSON only as a single object: {"questions": [{"prompt": "...", "options": [{"letter": "A", "text": "..."}, {"letter": "B", "text": "..."}, {"letter": "C", "text": "..."}, {"letter": "D", "text": "..."}], "correctAnswer": "B"}, ...]}. No prose, no markdown.',
        },
        {
          role: "user",
          content: `Generate 5-10 multiple choice questions from this material for a quiz titled "${title}"${
            course ? ` in the course "${course}"` : ""
          }. Return JSON {"questions": [...]}.\n\nMATERIAL:\n${filePreview}`,
        },
      ],
      { jsonMode: true },
    );

    let parsed: { questions?: RawQuestion[] } | RawQuestion[];
    try {
      parsed = extractFirstJson<{ questions?: RawQuestion[] } | RawQuestion[]>(
        response,
      );
    } catch (e) {
      return NextResponse.json(
        {
          error:
            "AI did not return valid JSON. Try a smaller / clearer source file.",
          detail: e instanceof Error ? e.message : String(e),
        },
        { status: 502 },
      );
    }
    const raw: RawQuestion[] = Array.isArray(parsed)
      ? parsed
      : (parsed?.questions ?? []);
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json(
        { error: "Model returned no questions" },
        { status: 502 },
      );
    }

    const questions = raw
      .filter(
        (q) =>
          typeof q?.prompt === "string" &&
          Array.isArray(q?.options) &&
          q.options.length === 4 &&
          ["A", "B", "C", "D"].includes(q.correctAnswer),
      )
      .map((q, i) => ({
        id: `q${i + 1}`,
        prompt: q.prompt.trim(),
        options: q.options.map((o) => ({
          letter: o.letter,
          text: String(o.text).trim(),
        })),
        correctAnswer: q.correctAnswer,
      }));

    try {
      const payload = {
        title,
        course,
        source: file.name,
        questions,
      };
      const { data, error } = await supabaseAdmin
        .from("quizzes")
        .insert(payload)
        .select()
        .single();
      if (!error) {
        return NextResponse.json({
          title: data.title,
          course: data.course,
          source: data.source,
          questions: data.questions,
          id: data.id,
          created_at: data.created_at,
        });
      }
    } catch (e) {
      // ignore db error
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
