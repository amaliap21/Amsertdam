export type ExtractedUploadText = {
  text: string;
  wordCount: number;
  characterCount: number;
  pageCount?: number;
};

function normalizeText(raw: string) {
  // Keep Unicode (Indonesian, accents, em-dashes, etc.). Only strip control
  // chars that are not whitespace, then collapse runs of whitespace.
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export async function extractTextFromUpload(file: File): Promise<ExtractedUploadText> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    const mod = (await import("pdf-parse")) as unknown as {
      PDFParse?: (new (opts: { data: Uint8Array; disableWorker?: boolean }) => {
        getText: () => Promise<{ text?: string; total?: number }>;
        destroy: () => Promise<void>;
      }) & {
        setWorker?: (src?: string) => string;
      };
      default?: unknown;
    };
    const PDFParseCtor =
      mod.PDFParse ??
      (mod.default as { PDFParse?: typeof mod.PDFParse } | undefined)?.PDFParse;
    if (typeof PDFParseCtor !== "function") {
      throw new Error(
        "pdf-parse: PDFParse class not found on module export.",
      );
    }
    try {
      const { createRequire } = await import("module");
      const { pathToFileURL } = await import("url");
      const req = createRequire(import.meta.url);
      const workerPath = req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
      PDFParseCtor.setWorker?.(pathToFileURL(workerPath).href);
    } catch {}
    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParseCtor({ data: new Uint8Array(buffer), disableWorker: true });
    let parsed: { text?: string; total?: number };
    try {
      parsed = await parser.getText();
    } finally {
      try { await parser.destroy(); } catch {}
    }
    const text = normalizeText(parsed?.text ?? "");
    return {
      text,
      wordCount: countWords(text),
      characterCount: text.length,
      pageCount: typeof parsed?.total === "number" ? parsed.total : undefined,
    };
  }

  const text = normalizeText(await file.text());
  return {
    text,
    wordCount: countWords(text),
    characterCount: text.length,
  };
}
