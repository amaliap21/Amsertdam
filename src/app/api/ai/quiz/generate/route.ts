import { NextRequest, NextResponse } from "next/server";
import { extractTextFromUpload } from "@/lib/upload-text";
import { requireUserId } from "@/lib/get-user-id";
import { ownsStoragePath, downloadStoredFile, deleteStoredFile, UPLOAD_BUCKETS } from "@/lib/storage-uploads";
import {
  extractQuiz,
  estimateMaxQuestions,
  type Language,
  type QuizQuestion,
} from "@/lib/python-ports/quiz-extractor";
import {
  chatWithFallback,
  AllModelsFailedError,
  resolveChain,
  modelTier,
  type Tier,
} from "@/lib/ai/openrouter";
import { spendCredit, refundCredit, getCredits } from "@/lib/ai/credits";
import { peekQuota, consumeQuotaN, refundQuotaN } from "@/lib/ai/limits";
import { normalizeOpenRouterQuiz } from "@/lib/ai/normalizers";
import { validateQuizPayload } from "@/lib/ai/validator";
import { splitTextIntoChunks } from "@/lib/ai/splitter";
import { polishQuizPayload } from "@/lib/ai/polish";
import { cleanSourceText } from "@/lib/ai/clean-source";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

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
  const { userId } = auth;

  try {
    const formData = await req.formData();
    let file = formData.get("file") as File | null;
    const bucket = formData.get("bucket") as string | null;
    const path = formData.get("path") as string | null;
    const fileName = formData.get("fileName") as string | null;
    const fileType = formData.get("fileType") as string | null;

    if (bucket && path && fileName && fileType) {
      if (!ownsStoragePath(bucket, path, userId, [UPLOAD_BUCKETS.transient, UPLOAD_BUCKETS.materials])) {
        return NextResponse.json({ error: "Invalid storage path." }, { status: 403 });
      }
      file = await downloadStoredFile(bucket, path, fileName, fileType);
      void deleteStoredFile(bucket, path);
    }
    
    const title = (formData.get("title") as string) || "Untitled Quiz";
    const course = (formData.get("course") as string) || "";
    const mode = (formData.get("mode") as string) || "generate";
    const requestedQuestionsRaw = Number(
      formData.get("requestedQuestions") ?? 0,
    );
    const langRaw = String(formData.get("language") ?? "en").toLowerCase();
    const language: Language = langRaw === "id" ? "id" : "en";

    // The user can pick the AI model. The billing tier is DERIVED from that
    // model — never trusted from the client — so a premium model always
    // bills a credit and a free model never does.
    const requestedModel =
      typeof formData.get("model") === "string"
        ? (formData.get("model") as string)
        : undefined;
    const tierFromModel = requestedModel ? modelTier(requestedModel) : null;
    if (requestedModel && !tierFromModel) {
      return NextResponse.json({ error: "Unknown model." }, { status: 400 });
    }
    const tier: Tier = tierFromModel ?? "free";
    const isPremium = tier === "premium";

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
    const isImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);

    if (!isPdf && !isTxt && !isImage) {
      return NextResponse.json(
        {
          error: "Quiz Lab accepts PDF, .txt, or image files (PNG/JPG/WebP).",
        },
        { status: 415 },
      );
    }

    // Vision input requires a vision-capable (premium) model. Tesseract OCR
    // can't read 2D math layouts like stacked fractions or exponents, so the
    // only reliable path here is a vision LLM.
    if (isImage && !isPremium) {
      return NextResponse.json(
        {
          error:
            "Image input requires a Premium model (Claude Opus). Tesseract OCR can't read stacked fractions, exponents, or other 2D math layouts.",
        },
        { status: 400 },
      );
    }

    // Text-based files run through the deterministic text extractor for
    // chunking. Image input skips that (the vision LLM reads the picture
    // directly) and uses a fixed maxQuestions estimate.
    let cleaned = "";
    let maxQuestions: number;
    let extractedMeta: { pageCount: number | null; wordCount: number } = {
      pageCount: null,
      wordCount: 0,
    };

    if (isImage) {
      maxQuestions = 8; // vision: one image, can't pre-count terms
    } else {
      const extracted = await extractTextFromUpload(file);
      // Strip cover / table-of-contents / page-header front matter so the model
      // sees substantive content, not navigation it would quiz uselessly.
      cleaned = cleanSourceText(tidyText(extracted.text));
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
      maxQuestions = estimateMaxQuestions(cleaned);
      extractedMeta = {
        pageCount: extracted.pageCount ?? null,
        wordCount: extracted.wordCount,
      };
    }

    if (mode === "analyze") {
      return NextResponse.json({
        title,
        course,
        maxQuestions,
        pageCount: extractedMeta.pageCount,
        wordCount: extractedMeta.wordCount,
      });
    }

    const requested = Number.isFinite(requestedQuestionsRaw)
      ? requestedQuestionsRaw
      : 0;
    let effective =
      requested > 0 ? Math.min(requested, maxQuestions) : maxQuestions;

    // Billing: ONE unit per QUESTION generated, on BOTH tiers — premium spends
    // durable credits, free spends the daily free quota. We reserve units up
    // front for the full target (capped to what the user can afford), then
    // refund any questions we don't end up producing (the deterministic-
    // extractor fallback is free).
    let reservedCredits = 0;
    let reservedFree = 0;
    if (isPremium) {
      const balance = await getCredits(userId);
      if (balance <= 0) {
        return NextResponse.json(
          {
            error: `Not enough premium credits. Buy a credit pack to generate with this model.`,
            needsCredits: true,
            cost: 1,
          },
          { status: 402 },
        );
      }
      // Can't generate (or charge for) more questions than the user can afford.
      effective = Math.max(1, Math.min(effective, balance));
      const newBalance = await spendCredit(userId, effective);
      if (newBalance === null) {
        return NextResponse.json(
          {
            error: `Not enough premium credits. Buy a credit pack to generate with this model.`,
            needsCredits: true,
            cost: effective,
          },
          { status: 402 },
        );
      }
      reservedCredits = effective;
    } else {
      const remaining = await peekQuota(userId);
      if (remaining <= 0) {
        return NextResponse.json(
          {
            error:
              "Daily free limit reached (resets at midnight UTC). Use premium credits to generate more.",
            quotaExceeded: true,
          },
          { status: 429 },
        );
      }
      // Don't generate (or charge for) more than the remaining daily quota.
      effective = Math.max(1, Math.min(effective, remaining));
      reservedFree = await consumeQuotaN(userId, effective);
      if (reservedFree < 1) {
        return NextResponse.json(
          {
            error:
              "Daily free limit reached (resets at midnight UTC). Use premium credits to generate more.",
            quotaExceeded: true,
          },
          { status: 429 },
        );
      }
      effective = reservedFree;
    }

    // Shared system prompt — used by both text and vision paths so the
    // contract is identical regardless of input modality.
    //
    // Pipeline order is LLM-FIRST. The LLM reads the source (text, image,
    // handwriting, math symbols) and emits structured JSON. The regex
    // "polisher" (src/lib/ai/polish.ts) runs AFTER, only to NORMALIZE the
    // LLM's formatting (strip option prefixes, markdown, leading numbering,
    // smart quotes). The deterministic extractQuiz() regex extractor runs
    // ONLY as a last-resort fallback when the LLM returns zero usable
    // questions. Regex never overrides LLM content.
    const buildSystemPrompt = (n: number, lang: Language) =>
      [
        `You are a careful, accurate study-quiz generator that handles all subjects, including mathematics, science, and humanities.`,
        `Use ${lang === "id" ? "Indonesian" : "English"} for all questions and options; do not mix languages unless the source text is mixed.`,
        `Identify the core concepts and important context in the source, and write questions that test understanding of those key points rather than trivial details.`,
        `Ignore all non-teaching material: cover pages, author or group member names, student id numbers, lecturer or supervisor names, institution names, the table of contents, lists of figures or tables, page numbers, chapter or section numbering, and running headers or footers. NEVER ask who wrote the document, how many pages or members it has, on which page or in which chapter something appears, or anything about the document's structure. Test only subject-matter concepts, definitions, processes, causes and effects, and reasoning a student must actually learn.`,
        `Respond ONLY with a single valid JSON object matching: {"questions":[{"prompt":"...","options":[{"letter":"A","text":"..."}],"correctAnswer":"A"}]}.`,
        `Produce ${n} distinct multiple-choice questions derived from the provided source, aim for the full count, only producing fewer if the source genuinely lacks enough material. Always include exactly 4 options A/B/C/D. Keep options plausible and the correct answer grounded in the source.`,
        `Read everything visible in the source: typed text, handwritten notes, diagrams, equations, and any mathematical or scientific symbols. Do not skip a section because it is handwritten or stylized, read it.`,
        `When the source contains math: transcribe stacked fractions as "a/b", superscripts as "x^n", subscripts as "x_n", square roots as "sqrt(x)", integrals as "integral", limits as "lim", Greek letters by name (alpha, beta, pi), and inequalities exactly as drawn (preserve "<", ">", "<=", ">=" direction).`,
        `Solve every math problem yourself before emitting it: the marked correctAnswer MUST be the mathematically correct option. Do not guess.`,
        `Use plain-text math notation throughout, no LaTeX, no Unicode math glyphs that won't render in a plain web textarea. Keep distractors realistic (common algebraic slips, sign errors, off-by-one) so the question actually tests understanding.`,
        `If a region of the source is illegible, skip questions from that region rather than fabricating content.`,
      ].join(" ");

    // Global time budget for ALL LLM work in this request. maxDuration is 60s;
    // we target ~50s of model work and leave headroom for request parsing,
    // the deterministic fallback, and the DB write. Every chatWithFallback
    // call below is capped to whatever budget remains, and the chunk loop
    // bails once the budget can't fund another real attempt. This is what
    // prevents FUNCTION_INVOCATION_TIMEOUT on multi-chunk PDFs.
    const ROUTE_DEADLINE_MS = 50_000;
    const routeStartedAt = Date.now();
    const MIN_CALL_MS = 6_000; // don't start a call we can't meaningfully finish
    const remainingBudget = () =>
      ROUTE_DEADLINE_MS - (Date.now() - routeStartedAt);

    const target = Math.max(1, effective);
    let questions: QuizQuestion[] = [];
    // The LLM produced nothing or its output failed validation.
    let basic = false;

    const chain = resolveChain(requestedModel, tier);
    // Shared across every LLM call in THIS request so a model that hard
    // rate-limits (429) on one chunk isn't re-hit on the next.
    const llmSkip = new Set<string>();

    // Accumulate UNIQUE questions across calls. The model routinely under-
    // delivers on a single request (returns fewer than asked), and the
    // polisher drops any malformed ones — so one call rarely yields the
    // full count. We over-request each call and run top-up passes until we
    // reach `target`, exhaust the time budget, or hit the attempt cap.
    const seenPrompts = new Set<string>();
    const collected: QuizQuestion[] = [];
    const promptKey = (p: string) =>
      p.toLowerCase().replace(/\s+/g, " ").trim();
    const pushUnique = (qs: QuizQuestion[]) => {
      for (const q of qs) {
        if (collected.length >= target) break;
        const key = promptKey(q.prompt);
        if (seenPrompts.has(key)) continue;
        seenPrompts.add(key);
        collected.push(q);
      }
    };
    const overAsk = (want: number) =>
      Math.min(maxQuestions, want + Math.ceil(want * 0.5) + 1);
    const avoidClause = () => {
      if (!collected.length) return "";
      const recent = collected
        .slice(-12)
        .map((q) => `- ${q.prompt}`)
        .join("\n");
      return `\n\nDo NOT repeat or rephrase any of these already-created questions:\n${recent}`;
    };

    const runCall = async (
      messages: Parameters<typeof chatWithFallback>[0],
    ): Promise<QuizQuestion[]> => {
      const resp = await chatWithFallback(messages, chain, {
        deadlineMs: remainingBudget(),
        maxTokens: 0,
        skip: llmSkip,
      });
      console.log("LLM response:", resp);
      const parsed = normalizeOpenRouterQuiz(resp.content);
      console.log("LLM parsed:", parsed);
      if (!parsed || !parsed.questions?.length) return [];
      const polished = polishQuizPayload(parsed).map((q, idx) => ({
        id: `llm_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        prompt: q.prompt,
        options: q.options,
        correctAnswer: q.correctAnswer,
      })) as QuizQuestion[];
      if (!polished.length || !validateQuizPayload({ questions: polished }))
        return [];
      return polished;
    };

    try {
      if (isImage) {
        const arrayBuf = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString("base64");
        const mime = file.type || "image/png";
        const dataUrl = `data:${mime};base64,${base64}`;
        const MAX_VISION_PASSES = 3;
        for (let pass = 0; pass < MAX_VISION_PASSES; pass++) {
          if (collected.length >= target) break;
          if (remainingBudget() < MIN_CALL_MS) break;
          const want = overAsk(target - collected.length);
          const system = buildSystemPrompt(want, language);
          const userInstruction =
            `Look at the image and produce ${want} multiple-choice questions ` +
            `from what it shows. Read EVERYTHING visible: typed text, handwriting, ` +
            `printed math, diagrams. If a fraction is drawn stacked, render it inline ` +
            `as "a/b". If you see an exponent as a superscript, write it as "x^n". ` +
            `Preserve inequality direction exactly ("<" stays "<", ">=" stays ">="). ` +
            `Treat any clearly written symbol as readable, never skip math just ` +
            `because it is handwritten. If a region is genuinely illegible, skip ` +
            `questions from it instead of guessing.` + avoidClause();
          try {
            pushUnique(
              await runCall([
                { role: "system", content: system },
                {
                  role: "user",
                  content: [
                    { type: "text", text: userInstruction },
                    { type: "image_url", image_url: { url: dataUrl } },
                  ],
                },
              ]),
            );
          } catch (err) {
            if (isPremium && err instanceof AllModelsFailedError) {
              if (reservedCredits > 0) {
                await refundCredit(userId, reservedCredits);
                reservedCredits = 0;
              }
              return NextResponse.json(
                { error: err.message, credits: await getCredits(userId) },
                { status: 503 },
              );
            }
            break;
          }
        }
      } else {
        const CHUNK_SIZE = Number(process.env.AI_CHUNK_SIZE || 4000);
        const CHUNK_OVERLAP = Number(process.env.AI_CHUNK_OVERLAP || 200);
        const threshold = CHUNK_SIZE * 1;
        const chunks =
          cleaned.length > threshold
            ? splitTextIntoChunks(cleaned, CHUNK_SIZE, CHUNK_OVERLAP)
            : [cleaned];
        const MAX_ATTEMPTS = chunks.length + 4;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          if (collected.length >= target) break;
          if (remainingBudget() < MIN_CALL_MS) break;
          const chunk = chunks[attempt % chunks.length];
          const want = overAsk(target - collected.length);
          const system = buildSystemPrompt(want, language);
          const user =
            `Source text:\n${chunk}\n\nProduce ${want} multiple-choice questions.` +
            avoidClause();
          try {
            pushUnique(
              await runCall([
                { role: "system", content: system },
                { role: "user", content: user },
              ]),
            );
          } catch (err) {
            if (isPremium && err instanceof AllModelsFailedError) {
              if (reservedCredits > 0) {
                await refundCredit(userId, reservedCredits);
                reservedCredits = 0;
              }
              return NextResponse.json(
                { error: err.message, credits: await getCredits(userId) },
                { status: 503 },
              );
            }
          }
        }
      }
    } catch {
      // fall back to extractor below (text path) or hard error (image)
    }

    questions = collected.slice(0, target);

    // Bill 1 unit per question actually produced. Refund the gap between what
    // we reserved up front and what we generated (covers the zero-question case
    // too — the extractor fallback below is free).
    if (isPremium && reservedCredits > questions.length) {
      await refundCredit(userId, reservedCredits - questions.length);
      reservedCredits = questions.length;
    }
    if (!isPremium && reservedFree > questions.length) {
      await refundQuotaN(userId, reservedFree - questions.length);
      reservedFree = questions.length;
    }

    if (!questions || questions.length === 0) {
      if (isImage) {
        // No deterministic fallback for images — the vision model is the
        // only path that can read 2D math layouts. Surface a clear error.
        return NextResponse.json(
          {
            error:
              "The Premium model couldn't extract questions from this image. Try a clearer image, or upload a PDF instead.",
            credits: isPremium ? await getCredits(userId) : undefined,
          },
          { status: 422 },
        );
      }
      questions = extractQuiz(cleaned, Math.max(1, effective), 0, language);
      basic = questions.length > 0; // deterministic fallback used after LLM produced nothing
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

    // For image quizzes, return the image so it can be shown on the quiz page
    // (questions reference "the image").
    let imageDataUrl: string | undefined;
    if (isImage) {
      const buf = Buffer.from(await file.arrayBuffer()).toString("base64");
      imageDataUrl = `data:${file.type || "image/png"};base64,${buf}`;
    }

    return NextResponse.json({
      title,
      course,
      source: file.name,
      questions,
      imageDataUrl,
      basic,
      maxQuestions,
      tier,
      credits: isPremium ? await getCredits(userId) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
