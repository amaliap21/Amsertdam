import { NextRequest, NextResponse } from "next/server";
import { extractTextFromUpload } from "@/lib/upload-text";
import { requireUserId } from "@/lib/get-user-id";
import {
  extractFlashcards,
  estimateMaxCards,
  type Language,
} from "@/lib/python-ports/flashcard-extractor";
import { AI_USE_LLM } from "@/lib/ai/config";
import {
  chatWithFallback,
  AllModelsFailedError,
  resolveChain,
  modelTier,
  PREMIUM_CREDIT_COST,
  type Tier,
} from "@/lib/ai/openrouter";
import { spendCredit, refundCredit, getCredits } from "@/lib/ai/credits";
import { normalizeOpenRouterFlashcards } from "@/lib/ai/normalizers";
import { validateFlashcardPayload } from "@/lib/ai/validator";
import { splitTextIntoChunks } from "@/lib/ai/splitter";
import { aggregateFlashcardResults } from "@/lib/ai/aggregator";
import { polishFlashcardPayload } from "@/lib/ai/polish";

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
    const file = formData.get("file");
    const deckName = (formData.get("deckName") as string) || "Untitled Deck";
    const mode = (formData.get("mode") as string) || "generate";
    const requestedCardsRaw = Number(formData.get("requestedCards") ?? 0);
    const langRaw = String(formData.get("language") ?? "en").toLowerCase();
    const language: Language = langRaw === "id" ? "id" : "en";

    // Model picker: tier derived server-side from the chosen model.
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
    const isImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);

    if (!isPdf && !isImage) {
      return NextResponse.json(
        {
          error:
            "This endpoint accepts PDF or image (PNG/JPG/WebP) files. For cover-and-reveal image decks use /api/ai/flashcards/ocr-image.",
        },
        { status: 415 },
      );
    }

    // Image input requires a vision-capable (premium) model — Tesseract can't
    // read 2D math layouts (stacked fractions, exponents) or handwriting
    // reliably. Vision LLMs do.
    if (isImage && !isPremium) {
      return NextResponse.json(
        {
          error:
            "Image input requires a Premium model (Claude Opus). It can read handwriting, stacked fractions, and other 2D math layouts that OCR can't.",
        },
        { status: 400 },
      );
    }

    let cleanedText = "";
    let maxCards: number;
    let extractedMeta: { pageCount: number | null; wordCount: number } = {
      pageCount: null,
      wordCount: 0,
    };

    if (isImage) {
      maxCards = 12; // vision: one image, no term-counting to bound from
    } else {
      const extracted = await extractTextFromUpload(file);
      cleanedText = tidyText(extracted.text);
      if (cleanedText.length < 40 || extracted.wordCount < 30) {
        return NextResponse.json(
          {
            error:
              "Could not extract enough readable text from this PDF. Try a text-based PDF (not a scan), or upload an image with a Premium model to use vision OCR.",
            extractedChars: cleanedText.length,
            extractedWords: extracted.wordCount,
          },
          { status: 422 },
        );
      }
      maxCards = estimateMaxCards(cleanedText);
      extractedMeta = {
        pageCount: extracted.pageCount ?? null,
        wordCount: extracted.wordCount,
      };
    }

    if (mode === "analyze") {
      return NextResponse.json({
        deckName,
        maxCards,
        pageCount: extractedMeta.pageCount,
        wordCount: extractedMeta.wordCount,
      });
    }

    const requested = Number.isFinite(requestedCardsRaw) ? requestedCardsRaw : 0;
    const effective = requested > 0 ? Math.min(requested, maxCards) : maxCards;

    // Premium picks bill ONE credit per generation job (not per chunk).
    let spentCredit = false;
    if (isPremium) {
      const balance = await spendCredit(userId, PREMIUM_CREDIT_COST);
      if (balance === null) {
        return NextResponse.json(
          {
            error: `Not enough premium credits. Buy a credit pack to generate with this model.`,
            needsCredits: true,
            cost: PREMIUM_CREDIT_COST,
          },
          { status: 402 },
        );
      }
      spentCredit = true;
    }

    // Shared system prompt — same contract for text and vision so the polish
    // pipeline downstream doesn't have to care about input modality.
    //
    // Pipeline order is LLM-FIRST. The LLM reads the source (text, image,
    // handwriting, math symbols) and emits structured JSON. The regex
    // "polisher" (src/lib/ai/polish.ts) runs AFTER, only to NORMALIZE the
    // LLM's formatting. The deterministic extractFlashcards() regex
    // extractor runs ONLY as a last-resort fallback when the LLM returns
    // zero usable cards. Regex never overrides LLM content.
    const buildSystemPrompt = (n: number, lang: Language) =>
      [
        `You are a careful, accurate study-flashcard generator that handles all subjects, including mathematics, science, and humanities.`,
        `Use ${lang === "id" ? "Indonesian" : "English"} for all cards; do not mix languages unless the source text is mixed.`,
        `Identify the core concepts and important context in the source, and write cards that capture those key points rather than trivial details.`,
        `Respond ONLY with a single valid JSON object matching: {"cards":[{"front":"...","back":"...","sourceSnippet":"..."}]}.`,
        `Produce up to ${n} cards derived from the provided source. Keep back concise (<=300 chars).`,
        `Read everything visible in the source: typed text, handwritten notes, diagrams, equations, and any mathematical or scientific symbols. Do not skip a section because it is handwritten or stylized — read it.`,
        `When the source contains math: transcribe stacked fractions as "a/b", superscripts as "x^n", subscripts as "x_n", square roots as "sqrt(x)", integrals as "integral", limits as "lim", Greek letters by name (alpha, beta, pi), and inequalities exactly as drawn ("<", ">", "<=", ">=").`,
        `For formulas: name/statement on the front, the formula + one-line meaning on the back (e.g. front: "Quadratic formula", back: "x = (-b ± sqrt(b^2 - 4ac)) / (2a). Solves ax^2 + bx + c = 0").`,
        `For worked problems: prompt on the front, final answer + brief solution path on the back.`,
        `Use plain-text math notation throughout — no LaTeX, no Unicode math glyphs that won't render in a plain web textarea. Always make sure the back states a definite correct answer or rule, not a guess.`,
        `If a region of the source is genuinely illegible, skip cards from that region rather than fabricating content.`,
      ].join(" ");

    let cards: any[] = [];
    if (AI_USE_LLM) {
      const chain = resolveChain(requestedModel, tier);

      try {
        if (isImage) {
          // ── Vision path ─────────────────────────────────────────────
          // Reads handwriting and 2D math layouts that Tesseract can't.
          const arrayBuf = await file.arrayBuffer();
          const base64 = Buffer.from(arrayBuf).toString("base64");
          const mime = file.type || "image/png";
          const dataUrl = `data:${mime};base64,${base64}`;
          const system = buildSystemPrompt(effective, language);
          const userInstruction =
            `Look at the image and produce up to ${effective} flashcards from ` +
            `what it shows. Read EVERYTHING visible: typed text, handwriting, ` +
            `printed math, diagrams. Render stacked fractions inline as "a/b", ` +
            `superscripts as "x^n", and preserve inequality direction. Treat ` +
            `any clearly written symbol as readable — never skip math just ` +
            `because it is handwritten.`;
          try {
            const resp = await chatWithFallback(
              [
                { role: "system", content: system },
                {
                  role: "user",
                  content: [
                    { type: "text", text: userInstruction },
                    { type: "image_url", image_url: { url: dataUrl } },
                  ],
                },
              ],
              chain,
            );
            const parsed = normalizeOpenRouterFlashcards(resp.content);
            if (parsed && parsed.cards?.length) {
              const polished = polishFlashcardPayload(parsed);
              if (polished.length && validateFlashcardPayload({ cards: polished })) {
                cards = polished.slice(0, Math.max(1, effective));
              }
            }
          } catch (err) {
            if (isPremium && err instanceof AllModelsFailedError) {
              await refundCredit(userId, PREMIUM_CREDIT_COST);
              spentCredit = false;
              return NextResponse.json(
                { error: err.message, credits: await getCredits(userId) },
                { status: 503 },
              );
            }
          }
        } else {
          // ── Text path (PDF) ─────────────────────────────────────────
          const CHUNK_SIZE = Number(process.env.AI_CHUNK_SIZE || 4000);
          const CHUNK_OVERLAP = Number(process.env.AI_CHUNK_OVERLAP || 200);
          const chunks =
            cleanedText.length > CHUNK_SIZE
              ? splitTextIntoChunks(cleanedText, CHUNK_SIZE, CHUNK_OVERLAP)
              : [cleanedText];
          const perChunk = Math.max(1, Math.ceil(effective / chunks.length));
          const parts: any[][] = [];
          for (const chunk of chunks) {
            const system = buildSystemPrompt(perChunk, language);
            const user = `Source text:\n${chunk}\n\nReturn up to ${perChunk} flashcards.`;
            try {
              const resp = await chatWithFallback(
                [
                  { role: "system", content: system },
                  { role: "user", content: user },
                ],
                chain,
              );
              const parsed = normalizeOpenRouterFlashcards(resp.content);
              if (parsed && parsed.cards?.length) {
                // Two-stage pipeline: LLM emits JSON, regex polisher strips
                // markdown / Q-A labels / leading numbering / smart quotes
                // / trailing punctuation on bare-term fronts, and rejects
                // placeholder content. Validate the polished payload.
                const polished = polishFlashcardPayload(parsed);
                if (polished.length && validateFlashcardPayload({ cards: polished })) {
                  parts.push(polished);
                }
              }
            } catch (err) {
              if (isPremium && err instanceof AllModelsFailedError) {
                await refundCredit(userId, PREMIUM_CREDIT_COST);
                spentCredit = false;
                return NextResponse.json(
                  { error: err.message, credits: await getCredits(userId) },
                  { status: 503 },
                );
              }
            }
            if (parts.flat().length >= effective) break;
          }
          if (parts.length > 0) {
            cards = aggregateFlashcardResults(parts, Math.max(1, effective));
          }
        }
      } catch {
        // fall back to deterministic extractor (text path only)
      }
    }

    if (!cards || cards.length === 0) {
      // Refund any premium credit since the user didn't actually consume the
      // paid model.
      if (spentCredit) {
        await refundCredit(userId, PREMIUM_CREDIT_COST);
        spentCredit = false;
      }
      if (isImage) {
        // No deterministic fallback for images — vision is the only path.
        return NextResponse.json(
          {
            error:
              "The Premium model couldn't extract flashcards from this image. Try a clearer image, or upload a PDF instead.",
            credits: isPremium ? await getCredits(userId) : undefined,
          },
          { status: 422 },
        );
      }
      cards = extractFlashcards(cleanedText, Math.max(1, effective), language);
    }

    if (cards.length === 0) {
      return NextResponse.json({
        deckName,
        cards: [
          {
            front: "(No definable terms found)",
            back: cleanedText.slice(0, 200),
          },
        ],
        maxCards,
        tier,
      });
    }

    return NextResponse.json({
      deckName,
      cards,
      maxCards,
      tier,
      credits: isPremium ? await getCredits(userId) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
