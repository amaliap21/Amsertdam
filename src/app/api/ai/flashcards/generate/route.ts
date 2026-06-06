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
  type Tier,
} from "@/lib/ai/openrouter";
import { spendCredit, refundCredit, getCredits } from "@/lib/ai/credits";
import { peekQuota, consumeQuotaN, refundQuotaN } from "@/lib/ai/limits";
import { normalizeOpenRouterFlashcards } from "@/lib/ai/normalizers";
import { validateFlashcardPayload } from "@/lib/ai/validator";
import { splitTextIntoChunks } from "@/lib/ai/splitter";
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
    let effective = requested > 0 ? Math.min(requested, maxCards) : maxCards;

    // Billing: ONE unit per CARD generated, on BOTH tiers — premium spends
    // durable credits, free spends the daily free quota. We reserve units up
    // front for the full target (capped to what the user can afford), then
    // refund any cards we don't end up producing.
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
      // Can't generate (or charge for) more cards than the user can afford.
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
        `Produce ${n} distinct cards derived from the provided source, aim for the full count, only producing fewer if the source genuinely lacks enough material. Keep back concise (<=300 chars).`,
        `Read everything visible in the source: typed text, handwritten notes, diagrams, equations, and any mathematical or scientific symbols. Do not skip a section because it is handwritten or stylized, read it.`,
        `When the source contains math: transcribe stacked fractions as "a/b", superscripts as "x^n", subscripts as "x_n", square roots as "sqrt(x)", integrals as "integral", limits as "lim", Greek letters by name (alpha, beta, pi), and inequalities exactly as drawn ("<", ">", "<=", ">=").`,
        `For formulas: name/statement on the front, the formula + one-line meaning on the back (e.g. front: "Quadratic formula", back: "x = (-b ± sqrt(b^2 - 4ac)) / (2a). Solves ax^2 + bx + c = 0").`,
        `For worked problems: prompt on the front, final answer + brief solution path on the back.`,
        `Use plain-text math notation throughout, no LaTeX, no Unicode math glyphs that won't render in a plain web textarea. Always make sure the back states a definite correct answer or rule, not a guess.`,
        `If a region of the source is genuinely illegible, skip cards from that region rather than fabricating content.`,
      ].join(" ");

    // Global time budget for ALL LLM work in this request (see the quiz route
    // for the full rationale). Caps every chatWithFallback call and bails the
    // chunk loop before the budget is exhausted, so multi-chunk PDFs can't
    // trigger FUNCTION_INVOCATION_TIMEOUT.
    const ROUTE_DEADLINE_MS = 50_000;
    const routeStartedAt = Date.now();
    const MIN_CALL_MS = 6_000;
    const remainingBudget = () =>
      ROUTE_DEADLINE_MS - (Date.now() - routeStartedAt);

    const target = Math.max(1, effective);
    let cards: { front: string; back: string }[] = [];
    if (AI_USE_LLM) {
      const chain = resolveChain(requestedModel, tier);

      // Accumulate UNIQUE cards across calls. A single request usually under-
      // delivers (model returns fewer than asked) and the polisher drops
      // malformed/placeholder cards — so we over-request and run top-up
      // passes until we reach `target`, exhaust the budget, or hit the cap.
      const seenFronts = new Set<string>();
      const collected: { front: string; back: string }[] = [];
      const frontKey = (f: string) =>
        f.toLowerCase().replace(/\s+/g, " ").trim();
      const pushUnique = (cs: { front: string; back: string }[]) => {
        for (const c of cs) {
          if (collected.length >= target) break;
          const key = frontKey(c.front);
          if (seenFronts.has(key)) continue;
          seenFronts.add(key);
          collected.push(c);
        }
      };
      const overAsk = (want: number) =>
        Math.min(maxCards, want + Math.ceil(want * 0.5) + 1);
      const avoidClause = () => {
        if (!collected.length) return "";
        const recent = collected
          .slice(-15)
          .map((c) => `- ${c.front}`)
          .join("\n");
        return `\n\nDo NOT repeat or rephrase any of these already-created card fronts:\n${recent}`;
      };

      // No output token cap (`maxTokens: 0`) — the model returns as many
      // tokens as it wants, so the JSON array is never truncated mid-way
      // regardless of how many cards it produces. Runtime is still bounded by
      // the per-call `deadlineMs` and the route's maxDuration.
      const runCall = async (
        messages: Parameters<typeof chatWithFallback>[0],
      ): Promise<{ front: string; back: string }[]> => {
        const resp = await chatWithFallback(messages, chain, {
          deadlineMs: remainingBudget(),
          maxTokens: 0,
        });
        const parsed = normalizeOpenRouterFlashcards(resp.content);
        if (!parsed || !parsed.cards?.length) return [];
        // LLM JSON → regex polish (markdown / Q-A labels / numbering / smart
        // quotes / trailing punctuation; reject placeholders), then validate.
        const polished = polishFlashcardPayload(parsed);
        if (!polished.length || !validateFlashcardPayload({ cards: polished }))
          return [];
        return polished;
      };

      try {
        if (isImage) {
          // ── Vision path ─────────────────────────────────────────────
          // Reads handwriting and 2D math layouts that Tesseract can't.
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
              `Look at the image and produce ${want} flashcards from ` +
              `what it shows. Read EVERYTHING visible: typed text, handwriting, ` +
              `printed math, diagrams. Render stacked fractions inline as "a/b", ` +
              `superscripts as "x^n", and preserve inequality direction. Treat ` +
              `any clearly written symbol as readable, never skip math just ` +
              `because it is handwritten.` + avoidClause();
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
          // ── Text path (PDF) ─────────────────────────────────────────
          const CHUNK_SIZE = Number(process.env.AI_CHUNK_SIZE || 4000);
          const CHUNK_OVERLAP = Number(process.env.AI_CHUNK_OVERLAP || 200);
          const chunks =
            cleanedText.length > CHUNK_SIZE
              ? splitTextIntoChunks(cleanedText, CHUNK_SIZE, CHUNK_OVERLAP)
              : [cleanedText];
          const MAX_ATTEMPTS = chunks.length + 4;
          for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            if (collected.length >= target) break;
            if (remainingBudget() < MIN_CALL_MS) break;
            const chunk = chunks[attempt % chunks.length];
            const want = overAsk(target - collected.length);
            const system = buildSystemPrompt(want, language);
            const user =
              `Source text:\n${chunk}\n\nProduce ${want} flashcards.` +
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
        // fall back to deterministic extractor (text path only)
      }

      cards = collected.slice(0, target);
    }

    // Bill 1 unit per card actually produced. Refund the gap between what we
    // reserved up front and what we generated (covers the zero-card case too —
    // the extractor fallback below is free).
    if (isPremium && reservedCredits > cards.length) {
      await refundCredit(userId, reservedCredits - cards.length);
      reservedCredits = cards.length;
    }
    if (!isPremium && reservedFree > cards.length) {
      await refundQuotaN(userId, reservedFree - cards.length);
      reservedFree = cards.length;
    }

    if (!cards || cards.length === 0) {
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
