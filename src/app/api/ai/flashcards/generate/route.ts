import { NextRequest, NextResponse } from "next/server";
import { extractTextFromUpload } from "@/lib/upload-text";
import { requireUserId } from "@/lib/get-user-id";
import {
  extractFlashcards,
  estimateMaxCards,
  type Language,
} from "@/lib/python-ports/flashcard-extractor";
import { AI_USE_LLM } from "@/lib/ai/config";
import { generateFlashcardsWithProviders } from "@/lib/ai/provider-router";
import { splitTextIntoChunks } from "@/lib/ai/splitter";
import { aggregateFlashcardResults } from "@/lib/ai/aggregator";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// Flashcard generation, NO AI, NO external APIs. Runs the deterministic
// pattern + cloze extractor inline so it works in both `next dev` and on
// Vercel without needing a Python function to be deployed.

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
    const deckName = (formData.get("deckName") as string) || "Untitled Deck";
    const mode = (formData.get("mode") as string) || "generate";
    const requestedCardsRaw = Number(formData.get("requestedCards") ?? 0);
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
    if (!isPdf) {
      return NextResponse.json(
        {
          error:
            "This endpoint accepts PDFs only. Images should be sent to /api/ai/flashcards/ocr-image; other types aren't supported.",
        },
        { status: 415 },
      );
    }

    const extracted = await extractTextFromUpload(file);
    const cleanedText = tidyText(extracted.text);
    if (cleanedText.length < 40 || extracted.wordCount < 30) {
      return NextResponse.json(
        {
          error:
            "Could not extract enough readable text from this PDF. Try a text-based PDF (not a scan).",
          extractedChars: cleanedText.length,
          extractedWords: extracted.wordCount,
        },
        { status: 422 },
      );
    }

    const maxCards = estimateMaxCards(cleanedText);

    if (mode === "analyze") {
      return NextResponse.json({
        deckName,
        maxCards,
        pageCount: extracted.pageCount ?? null,
        wordCount: extracted.wordCount,
      });
    }

    const requested = Number.isFinite(requestedCardsRaw) ? requestedCardsRaw : 0;
    const effective = requested > 0 ? Math.min(requested, maxCards) : maxCards;

    // Attempt LLM-based generation if enabled. Falls back to deterministic extractor.
    let cards: any[] = [];
    if (AI_USE_LLM) {
      const CHUNK_SIZE = Number(process.env.AI_CHUNK_SIZE || 4000);
      const CHUNK_OVERLAP = Number(process.env.AI_CHUNK_OVERLAP || 200);
      try {
        const chunks = cleanedText.length > CHUNK_SIZE ? splitTextIntoChunks(cleanedText, CHUNK_SIZE, CHUNK_OVERLAP) : [cleanedText];
        const perChunk = Math.max(1, Math.ceil(effective / chunks.length));
        const parts: any[][] = [];
        for (const chunk of chunks) {
          const system = `You are a concise assistant. Respond ONLY with a single valid JSON object matching: {"cards":[{"front":"...","back":"...","sourceSnippet":"..."}]}. Produce up to ${perChunk} cards derived from the provided source text. Keep back concise (<=300 chars).`;
          const user = `Source text:\n${chunk}\n\nReturn up to ${perChunk} flashcards.`;
          try {
            const result = await generateFlashcardsWithProviders([
              { role: "system", content: system },
              { role: "user", content: user },
            ]);
            if (result.ok && result.payload?.cards?.length) parts.push(result.payload.cards);
          } catch {
            // ignore per-chunk failures
          }
          if (parts.flat().length >= effective) break;
        }
        if (parts.length > 0) {
          cards = aggregateFlashcardResults(parts, Math.max(1, effective));
        }
      } catch {
        // fall back to deterministic extractor
      }
    }

    if (!cards || cards.length === 0) {
      cards = extractFlashcards(cleanedText, Math.max(1, effective), language);
    }

    // The extractor has a guaranteed-output fallback now, so if cards is
    // still empty it means the text really had nothing to work with, even
    // then we return success with a single placeholder rather than 422,
    // because the user already saw text get accepted past the 40-char gate.
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
      });
    }

    return NextResponse.json({
      deckName,
      cards,
      maxCards,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
