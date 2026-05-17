import { NextRequest, NextResponse } from "next/server";
import { callClaude, extractFirstJson } from "@/lib/anthropic";
import { extractTextFromUpload } from "@/lib/upload-text";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

type Flashcard = { front: string; back: string };

type LooseCard = {
  front?: unknown;
  back?: unknown;
  question?: unknown;
  answer?: unknown;
  term?: unknown;
  definition?: unknown;
  q?: unknown;
  a?: unknown;
};

function normalizeCard(c: LooseCard): Flashcard | null {
  const front =
    (typeof c?.front === "string" && c.front) ||
    (typeof c?.question === "string" && c.question) ||
    (typeof c?.term === "string" && c.term) ||
    (typeof c?.q === "string" && c.q) ||
    "";
  const back =
    (typeof c?.back === "string" && c.back) ||
    (typeof c?.answer === "string" && c.answer) ||
    (typeof c?.definition === "string" && c.definition) ||
    (typeof c?.a === "string" && c.a) ||
    "";
  const f = String(front).trim();
  const b = String(back).trim();
  if (!f || !b) return null;
  return { front: f, back: b };
}

function tidyText(raw: string): string {
  // pdf-parse already returns proper text; just collapse whitespace and drop
  // control chars. DO NOT strip Unicode — Indonesian/academic content needs it.
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
    const deckName = (formData.get("deckName") as string) || "Untitled Deck";
    const mode = (formData.get("mode") as string) || "generate";
    const requestedCardsRaw = Number(formData.get("requestedCards") ?? 0);

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
            "Image OCR is not enabled on this endpoint. Please upload a PDF or text file containing readable text.",
        },
        { status: 415 },
      );
    }

    const extracted = await extractTextFromUpload(file);
    const cleanedText = tidyText(extracted.text);
    // Sample the middle of the document — title pages, abstract pages, and
    // references are usually less informative than body content.
    const total = cleanedText.length;
    const windowSize = 12000;
    const start = total > windowSize * 1.5 ? Math.floor(total * 0.15) : 0;
    const filePreview = cleanedText.substring(start, start + windowSize);
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

    const limitResponse = await callClaude(
      [
        {
          role: "system",
          content:
            'You estimate the MAXIMUM number of flashcards a source can comfortably support. Be GENEROUS — every distinct term, concept, definition, formula, or fact is a candidate card. Respond with strict JSON only: {"maxCards": number}. The limit must be between 8 and 30. Favor the higher end when the source is dense with terminology.',
        },
        {
          role: "user",
          content: `Estimate the maximum flashcard count for a deck titled "${deckName}" from the content below. Count distinct concepts, terms, and facts and return the source's maximum capacity, not a conservative average. Return JSON only.\n\nMATERIAL:\n${filePreview}`,
        },
      ],
      { jsonMode: true },
    );

    const wordCount = filePreview.split(/\s+/).filter(Boolean).length;
    const heuristic = Math.max(10, Math.min(30, Math.round(wordCount / 60)));
    let maxCards = heuristic;
    try {
      const limitJson = extractFirstJson<{ maxCards?: number }>(limitResponse);
      const parsedLimit = Number(limitJson?.maxCards);
      if (Number.isFinite(parsedLimit)) {
        // Take the higher of the AI estimate and the heuristic.
        maxCards = Math.max(8, Math.min(30, Math.max(Math.round(parsedLimit), heuristic)));
      }
    } catch {
      maxCards = heuristic;
    }

    if (mode === "analyze") {
      return NextResponse.json({
        deckName,
        maxCards,
        pageCount: extracted.pageCount ?? null,
        wordCount: extracted.wordCount,
      });
    }

    const effectiveCards = Number.isFinite(requestedCardsRaw)
      ? Math.max(1, Math.min(maxCards, Math.round(requestedCardsRaw)))
      : maxCards;

    const systemPrompt =
      'You are an expert study aide. Read the source material carefully and produce atomic flashcards: a concise term, concept, or question on the front, and a clear, self-contained answer on the back. The source can be in any language (English, Indonesian, etc.) — write the cards in the SAME language as the source. Even if the material is messy, extract the key definitions, terms, formulas, and facts you can find. Respond with STRICT JSON ONLY — one object with shape {"cards": [{"front": "...", "back": "..."}, ...]}. No prose, no markdown, no commentary.';

    const userPrompt = (n: number) =>
      `Produce ${n} flashcards from the material below for a deck titled "${deckName}". Cover the most important concepts. Return ONLY {"cards": [{"front": "...", "back": "..."}, ...]} — never an empty list.\n\nMATERIAL:\n${filePreview}`;

    const askModel = async (n: number): Promise<LooseCard[]> => {
      const r = await callClaude(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt(n) },
        ],
        { jsonMode: true },
      );
      try {
        const p = extractFirstJson<
          { cards?: LooseCard[]; flashcards?: LooseCard[] } | LooseCard[]
        >(r);
        if (Array.isArray(p)) return p;
        if (Array.isArray(p?.cards)) return p.cards as LooseCard[];
        if (Array.isArray(p?.flashcards)) return p.flashcards as LooseCard[];
        return [];
      } catch {
        return [];
      }
    };

    let raw: LooseCard[] = await askModel(effectiveCards);
    if (raw.length === 0) {
      // Retry once with a smaller, more permissive ask in case the model balked.
      raw = await askModel(Math.min(5, effectiveCards));
    }

    if (raw.length === 0) {
      return NextResponse.json(
        {
          error:
            "AI couldn't extract flashcards from this source. The PDF text may be too sparse or fragmented — try a different section or a clearer source.",
        },
        { status: 502 },
      );
    }

    const cleaned: Flashcard[] = raw
      .map(normalizeCard)
      .filter((c): c is Flashcard => c !== null)
      .slice(0, effectiveCards);

    if (cleaned.length === 0) {
      return NextResponse.json(
        { error: "Model returned no usable flashcards" },
        { status: 502 },
      );
    }

    // No DB insert here — the client's store calls POST /api/flashcards to persist.
    return NextResponse.json({
      deckName,
      cards: cleaned,
      maxCards,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
