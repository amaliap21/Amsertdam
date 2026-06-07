// TypeScript port of api/python/flashcard_extractor.py, runs in Next's
// Node runtime so the route works in `next dev` and on Vercel without
// needing the Python function to be deployed. The algorithm is line-for-line
// equivalent: pattern matching + cloze deletion, no AI.

export type Flashcard = { front: string; back: string };

const MIN_TERM_LEN = 2;
const MAX_TERM_LEN = 60;
const MIN_DEFINITION_LEN = 10;
const MAX_DEFINITION_LEN = 280;
const MIN_CLOZE_SENTENCE_LEN = 40;
const MAX_CLOZE_SENTENCE_LEN = 220;

const STOP_WORDS = new Set<string>([
  "the","a","an","of","to","and","or","but","in","on","at","by",
  "for","with","as","is","are","was","were","be","been","being",
  "this","that","these","those","it","its","we","you","they",
  "i","he","she","his","her","their","our","us","them","me",
  "if","then","else","when","where","how","why","what","which",
  "who","whose","whom","all","any","some","no","not","only",
  "do","does","did","have","has","had","will","would","could",
  "should","may","might","can","must","shall","from","up","out",
  "so","than","too","very","just","also","such","more","most",
  // Indonesian common words
  "yang","dan","atau","tetapi","adalah","ialah","ini","itu","untuk",
  "pada","di","ke","dari","dengan","oleh","tidak","ada","akan",
  "telah","sudah","bisa","dapat","harus","seperti","juga","saya",
  "kamu","dia","mereka","kami","kita","sebuah","satu","dua","tiga",
]);

export const DEFINITION_VERBS = [
  "is","are","was","were",
  "means","refers to","denotes","represents",
  "is defined as","is known as","is called",
  "consists of","comprises","describes",
  "adalah","ialah","merupakan","yaitu","didefinisikan sebagai",
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const DEFINITION_VERB_PATTERN = DEFINITION_VERBS.map(escapeRegex).join("|");

export const WORD_RE = /[A-Za-z][A-Za-z\-']+/g;

// Strip leading bullet markers ("• ", "- ", "* ", "1. ", "1) ") so the term
// extractor sees the real content, not "• Photosynthesis".
const BULLET_PREFIX_RE = /^[\s•▪◦●○■□–, \-*]+|^\s*\d+[.)\s]+/;

// PDF artifact patterns. `pdf-parse` interleaves page headers/footers
// (e.g. "-- 3 of 10 --", "25 | J", running titles, journal codes) with the
// real prose. We scrub them out before splitting so they can't pollute
// terms or definitions.
const PDF_ARTIFACT_PATTERNS: RegExp[] = [
  /--\s*\d+\s+of\s+\d+\s*--/gi,             // "-- 3 of 10 --"
  /\b\d{1,3}\s*\|\s*[A-Z]\b/g,              // "25 | J"
  /\bPage\s+\d+(?:\s+of\s+\d+)?\b/gi,       // "Page 3 of 10"
  /https?:\/\/\S+/gi,                       // bare URLs
  /\b[\w.+-]+@[\w-]+\.[\w.-]+/g,            // email addresses
  /\bdoi\s*:\s*\S+/gi,                      // "doi: 10.xxx/..."
  /\bISSN\s*:?\s*[\d-]+/gi,                 // ISSN identifiers
  // Full journal byline: an optional leading sentence-end period, an
  // abbreviated journal name (1-6 short capitalized tokens, periods
  // optional), then "| VOL. N | NO. N | Month YYYY |". This is the
  // page-footer that pdf-parse glues into the middle of every sentence.
  //
  // Example match:  ". Ked. N. Med | VOL. 5 | NO. 1 | Maret 2022 |"
  /(?:\s*\.\s*)?(?:\b[A-Z]\w{0,6}\.?\s+){1,6}\|\s*VOL\.?\s*\d+\s*\|\s*NO\.?\s*\d+\s*\|[^|\n]*\|?/gi,
  // Defensive fallback: any leftover VOL./NO. byline core without the
  // abbreviated prefix.
  /VOL\.?\s*\d+\s*\|\s*NO\.?\s*\d+\s*\|[^|\n]*\|?/gi,
];

// Term-blocklist: common academic-paper section headings (English + Indonesian)
// that look like definable terms but actually introduce metadata.
const SECTION_HEADING_BLOCKLIST = new Set<string>([
  // English
  "abstract", "abstrak", "introduction", "background", "method", "methods",
  "methodology", "results", "discussion", "conclusion", "conclusions",
  "references", "acknowledgements", "acknowledgments", "appendix",
  "author", "authors", "affiliation", "affiliations", "keywords",
  "correspondence", "corresponding author", "received", "accepted",
  "published", "copyright", "license", "funding", "table of contents",
  // Indonesian
  "pendahuluan", "metode", "metodologi", "hasil", "pembahasan", "kesimpulan",
  "daftar pustaka", "ucapan terima kasih", "lampiran", "penulis",
  "afiliasi", "kata kunci", "korespondensi", "diterima", "disetujui",
  "diterbitkan", "hak cipta", "lisensi", "pendanaan",
]);

function stripPdfArtifacts(text: string): string {
  let cleaned = text;
  for (const re of PDF_ARTIFACT_PATTERNS) cleaned = cleaned.replace(re, " ");
  // Collapse runs of artifact-induced whitespace.
  cleaned = cleaned.replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n");
  return cleaned;
}

// Drop everything after a "References" / "Daftar Pustaka" / "Bibliography"
// heading, and drop the front-matter (title page, author affiliations) before
// the first content heading. What's left is the body, the only part of an
// academic paper that should produce flashcards.
function isolateBody(text: string): string {
  let body = text;

  // 1. Cut the references list. PDF extracts often glue "DAFTAR PUSTAKA" onto
  // the end of the previous line, so we don't require a newline before it.
  // Pick the LAST occurrence, refs are always at the end.
  const refsRe = /\b(?:references|daftar\s+pustaka|bibliography|works\s+cited)\b/gi;
  let lastRefsIdx = -1;
  let m: RegExpExecArray | null;
  while ((m = refsRe.exec(body)) !== null) {
    lastRefsIdx = m.index;
  }
  if (lastRefsIdx >= 0) {
    body = body.slice(0, lastRefsIdx);
  }

  // 2. Cut the front-matter. Academic PDFs from pdf-parse glue the title
  // page, author list, and affiliations onto one long line ending right
  // before "ABSTRAK"/"ABSTRACT"/"PENDAHULUAN". Slice from the document
  // start up to the FIRST occurrence of any of those headings, academic
  // papers always put them near the top, so first-match is reliable.
  // We deliberately don't constrain position: short documents put the
  // heading 50%+ into the text, and missing the cut means front-matter
  // pollutes the cards.
  const frontMatterRe =
    /\b(?:ABSTRAK|ABSTRACT|PENDAHULUAN|INTRODUCTION|BACKGROUND|LATAR\s+BELAKANG)\b/;
  const frontMatch = body.match(frontMatterRe);
  if (frontMatch && frontMatch.index !== undefined) {
    body = body.slice(frontMatch.index + frontMatch[0].length);
  }

  return body;
}

// Section-heading words that frequently appear inline in PDF text (because
// the heading and its body get glued together by pdf-parse). We strip the
// heading word from the START of a sentence so it can't become a cloze
// answer or a "term" in a colon-pattern match.
function stripLeadingHeading(sentence: string): string {
  const words = [...SECTION_HEADING_BLOCKLIST];
  const re = new RegExp(
    `^\\s*(?:${words
      .map((w) => w.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&"))
      .join("|")})\\s+(?=[A-ZА-Я])`,
    "i",
  );
  return sentence.replace(re, "");
}

export function isSectionHeading(term: string): boolean {
  const key = term.toLowerCase().trim();
  return SECTION_HEADING_BLOCKLIST.has(key);
}

// Citation-shaped sentences look like content because they have rare nouns,
// but they're noise, author lists, journal volumes/pages, etc.
function looksLikeCitation(sentence: string): boolean {
  // Two or more "Surname Initials," tokens in a row
  // → "Scott MRV, Chandler J, Olmstead S"
  if (/(?:\b[A-Z][a-zA-ZА-Я]+\s+[A-Z]{2,5}\b[,&]\s+){2,}/.test(sentence)) return true;
  // "Year,Volume:Pages" citation tail.
  // Variants supported:
  //   "2009,2:1–11"                  (plain)
  //   "2014,35: 71-86"               (space after colon)
  //   "2007,53(9):1134-45"           (issue in parens)
  //   "2009,297:L64–L72"             (letter-prefixed page range)
  if (
    /\b(?:19|20)\d{2}\s*[,;:]\s*\d+\s*(?:\(\s*\d+\s*\))?\s*:\s*[L]?\d+/.test(sentence)
  ) return true;
  // Standalone L-prefixed page range: "L64–L72"
  if (/\bL\d+\s*[–\-]\s*L\d+/.test(sentence)) return true;
  // Bare "Vol(Issue):Pages" without year tail
  if (/\b\d{1,3}\s*\(\s*\d+\s*\)\s*:\s*\d+[-–]\d+/.test(sentence)) return true;
  // Journal volume markers: "Am J Physiol", "Clin Chest Med", "J Inflamm",
  // "Respiratory Care", "Annu. Rev. Physiol", "J Allergy Clin Immunol"
  if (
    /\b(?:Am\s+J|J\s+Inflamm|Clin\s+Chest|Med\.\s*\d|Press,\s+\w+:\s*\d|Annu\.?\s+Rev|J\s+Allergy|J\s+Immunol|J\s+Physiol|Nature\s+Immunology|Respiratory\s+Care|Journal\s+of\s+(?:Inflammation|Infection))/.test(
      sentence,
    )
  ) return true;
  // Numbered reference line: "1. Author, Title, Journal...", a bare digit
  // followed by a period followed by capitalized surname.
  if (/^\s*\d+\.\s+[A-Z][a-z]+(?:\s+[A-Z]{1,5})?,/.test(sentence)) return true;
  // Editor / "dalam" (Indonesian for "in") citation context
  if (/\b(?:Editor|Editors?|dalam\s+The)\b/i.test(sentence) && /\(/.test(sentence)) return true;
  // "Kata Kunci: …" / "Keywords: …", front-matter metadata. These look
  // content-rich (terms separated by commas) but are useless for cards.
  if (/^\s*(?:Kata\s+Kunci|Keywords?)\s*:/i.test(sentence)) return true;
  return false;
}

// Front-matter lines: author affiliations, hospital/university metadata,
// and journal bylines. We test BEFORE the bullet-prefix strip so the leading
// affiliation number (e.g. "1 Fakultas...") is still attached.
function looksLikeAffiliation(sentence: string): boolean {
  // Leading-digit affiliation: "1 Fakultas...", "2 Rumah Sakit...".
  if (
    /^\s*\d{1,2}\s+(?:Fakultas|Universitas|Rumah\s+Sakit|Faculty|University|Hospital|Department|Institute|Sekolah|Jurusan|Kementerian)\b/i.test(
      sentence,
    )
  ) {
    return true;
  }
  // Affiliation line without a leading digit (some journals don't number).
  if (
    /^\s*(?:Fakultas|Universitas|Rumah\s+Sakit|Faculty|University|Hospital|Department|Institute|Sekolah|Jurusan|Kementerian)\b.{0,100},\s*[A-Z]/i.test(
      sentence,
    )
  ) {
    return true;
  }
  // Pure author-list line with multiple initials.
  if (/(?:\b[A-Z][a-zA-Z]+\s+[A-Z]{1,4}\b[,&]\s+){2,}/.test(sentence) && sentence.length < 200) {
    return true;
  }
  // Journal-header byline: 3+ pipes AND short (it's a pure header line,
  // not a long content line that happens to contain footer fragments).
  // We've already scrubbed VOL/NO bylines in stripPdfArtifacts, so any
  // surviving pipes mid-body are likely content tables, not headers.
  const pipeCount = (sentence.match(/\|/g) ?? []).length;
  if (pipeCount >= 3 && sentence.length < 120) return true;
  // Strong byline signal: VOL.+NO. on the same line, even if long, it's
  // a header that escaped the artifact scrubber.
  if (/\bVOL\.?\s*\d+\b/i.test(sentence) && /\bNO\.?\s*\d+\b/i.test(sentence)) return true;
  return false;
}

export function splitSentences(text: string): string[] {
  if (!text) return [];
  // Two-phase scrub: drop the references list + front-matter first, then
  // remove inline artifacts (page numbers, emails, etc).
  const scoped = isolateBody(text);
  const scrubbed = stripPdfArtifacts(scoped);

  // Step 1: split on hard line breaks first. PDF extracts often have bullet
  // lists where each line is its own "fact", and a naive sentence splitter
  // would miss them because there's no `.` between lines.
  const lines = scrubbed
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    // Drop affiliation / byline lines BEFORE stripping bullet prefixes so the
    // leading affiliation number stays visible to the detector.
    .filter((l) => !looksLikeAffiliation(l))
    .map((l) => l.replace(BULLET_PREFIX_RE, "").trim())
    .filter((l) => l.length > 0);

  // Step 2: within each line, split on sentence-ending punctuation. Permissive
  // lookahead (any character that's not a digit/space) so abbreviations like
  // "e.g." don't trip us, but normal "X. Y" still splits.
  const sentences: string[] = [];
  for (const line of lines) {
    const parts = line.split(/(?<=[.!?])\s+(?=[A-Za-zА-Я"'(])/);
    for (const p of parts) {
      let trimmed = p.replace(BULLET_PREFIX_RE, "").trim();
      // Strip "KESIMPULAN ", "ABSTRAK ", "PENDAHULUAN " etc. if the heading
      // got glued onto the start of the sentence.
      trimmed = stripLeadingHeading(trimmed).trim();
      if (trimmed.length <= 10) continue;
      if (looksLikeCitation(trimmed)) continue;
      sentences.push(trimmed);
    }
  }

  // Step 3: if we got nothing (one huge blob with no newlines or punctuation),
  // synthesize chunks by splitting on multiple spaces or returning the blob
  // as a single "sentence" so the cloze fallback has something to work with.
  if (sentences.length === 0) {
    const collapsed = scrubbed.replace(/\s+/g, " ").trim();
    if (collapsed.length > 10) sentences.push(collapsed);
  }
  return sentences;
}

export function tokenize(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

function isStopword(token: string): boolean {
  return STOP_WORDS.has(token.toLowerCase());
}

function cleanTerm(term: string): string {
  let t = term.replace(/\s+/g, " ").trim();
  t = t.replace(/^[\s,;:\-, –"'()]+|[\s,;:\-, –"'()]+$/g, "");
  t = t.replace(/^(?:a|an|the)\s+/i, "");
  return t;
}

function isUsefulTerm(term: string): boolean {
  if (!term || term.length < MIN_TERM_LEN || term.length > MAX_TERM_LEN) return false;
  if (/^\d+$/.test(term)) return false;
  if (isSectionHeading(term)) return false;
  const tokens = term.match(WORD_RE) ?? [];
  if (tokens.length === 0) return false;
  if (tokens.every(isStopword)) return false;
  if (tokens.length > 6) return false;
  return true;
}

function isUsefulDefinition(defn: string): boolean {
  if (!defn) return false;
  if (defn.length < MIN_DEFINITION_LEN || defn.length > MAX_DEFINITION_LEN) return false;
  if (!WORD_RE.test(defn)) {
    WORD_RE.lastIndex = 0;
    return false;
  }
  WORD_RE.lastIndex = 0;
  // Reject definitions that are mostly PDF metadata leftovers.
  // (We scrub artifacts upfront, but partial matches can sneak through.)
  if (/@|\bdoi\b|\bissn\b|\bpage\s*\d+\b|\bvol\.?\s*\d+\b/i.test(defn)) return false;
  // Reject definitions that are mostly digits or punctuation (page numbers,
  // citation indices, etc.).
  const wordChars = (defn.match(/[A-Za-zА-Я]/g) ?? []).length;
  if (wordChars < defn.length * 0.5) return false;
  return true;
}

// ---------- definition verb pattern ("X is Y") ----------

function extractDefinitionPairs(sentence: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const re = new RegExp(
    `^\\s*(.+?)\\s+(?:${DEFINITION_VERB_PATTERN})\\s+(.+?)\\s*[.!?]?\\s*$`,
    "i",
  );
  const m = sentence.match(re);
  if (m) {
    const term = cleanTerm(m[1]);
    const defn = m[2].trim().replace(/[.!?]+$/, "");
    if (isUsefulTerm(term) && isUsefulDefinition(defn)) {
      pairs.push([term, defn]);
    }
  }
  return pairs;
}

// ---------- colon / dash patterns ("X: Y") ----------

// Term/definition separator. We accept `:`, em-dash, en-dash, and a
// stand-alone hyphen surrounded by whitespace, but NOT a hyphen with no
// whitespace on either side, otherwise terms like "Kolagen tipe I-III"
// get split into "Kolagen tipe I" / "III adalah ...".
const COLON_DASH_RE = /^\s*([A-ZА-Я][\w\s\-]{1,60}?)\s*(?::|, |–|\s-\s)\s*(.{10,280})$/;

function extractColonDashPairs(sentence: string): Array<[string, string]> {
  const m = sentence.match(COLON_DASH_RE);
  if (!m) return [];
  const term = cleanTerm(m[1]);
  const defn = m[2].trim().replace(/[.!?]+$/, "");
  if (isUsefulTerm(term) && isUsefulDefinition(defn)) {
    return [[term, defn]];
  }
  return [];
}

// ---------- cloze fallback ----------

export function informativeScore(sentence: string): number {
  const tokens = tokenize(sentence);
  if (tokens.length === 0) return 0;
  const capitalized = tokens.filter((t) => /^[A-Z]/.test(t)).length;
  const longTokens = tokens.filter((t) => t.length >= 6).length;
  const hasNumber = /\b\d{2,}\b/.test(sentence);
  let score = capitalized * 1.0 + longTokens * 0.5 + (hasNumber ? 2.0 : 0.0);
  if (sentence.length < MIN_CLOZE_SENTENCE_LEN) score *= 0.3;
  if (sentence.length > MAX_CLOZE_SENTENCE_LEN) score *= 0.5;
  return score;
}

export function pickClozeTerm(
  sentence: string,
  termFreq: Map<string, number>,
  minLen = 4,
): string | null {
  const tokens = sentence.match(WORD_RE) ?? [];
  const candidates: Array<[number, string]> = [];
  for (const tok of tokens) {
    if (tok.length < minLen || isStopword(tok)) continue;
    const freq = termFreq.get(tok.toLowerCase()) ?? 1;
    const rarity = 1.0 / freq;
    const capBonus = /^[A-Z]/.test(tok) ? 0.5 : 0.0;
    const lengthBonus = (tok.length - 4) * 0.1;
    candidates.push([rarity + capBonus + lengthBonus, tok]);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b[0] - a[0]);
  return candidates[0][1];
}

function makeClozeCard(sentence: string, term: string): Flashcard | null {
  // Don't turn a section heading like "KESIMPULAN" into a flashcard answer.
  if (isSectionHeading(term)) return null;
  // Don't blank out single-letter or digit-only tokens.
  if (term.length < 2 || /^\d+$/.test(term)) return null;
  const re = new RegExp(`\\b${escapeRegex(term)}\\b`);
  if (!re.test(sentence)) return null;
  const cloze = sentence.replace(re, "_____");
  return { front: cloze, back: term };
}

// ---------- localized prompt strings ----------

export type Language = "en" | "id";

const FLASHCARD_PROMPTS: Record<Language, { whatIs: (term: string) => string; define: (term: string) => string }> = {
  en: {
    whatIs: (term) => `What is ${term}?`,
    define: (term) => `Define: ${term}`,
  },
  id: {
    whatIs: (term) => `Apa itu ${term}?`,
    define: (term) => `Definisikan: ${term}`,
  },
};

// ---------- main entry ----------

export function extractFlashcards(
  text: string,
  maxCards = 10,
  language: Language = "en",
): Flashcard[] {
  const sentences = splitSentences(text);
  const cards: Flashcard[] = [];
  const seenFronts = new Set<string>();
  const prompts = FLASHCARD_PROMPTS[language];

  const addCard = (front: string, back: string) => {
    const key = front.toLowerCase().trim();
    if (seenFronts.has(key)) return;
    seenFronts.add(key);
    cards.push({ front, back });
  };

  // Strategy 1 + 2, definition patterns.
  for (const sent of sentences) {
    if (cards.length >= maxCards) break;
    for (const [term, defn] of extractDefinitionPairs(sent)) {
      addCard(prompts.whatIs(term), defn);
      if (cards.length >= maxCards) break;
    }
    for (const [term, defn] of extractColonDashPairs(sent)) {
      addCard(prompts.define(term), defn);
      if (cards.length >= maxCards) break;
    }
  }

  // Strategy 3, cloze fallback. Try first with the strict 4-char minimum,
  // then re-run with a 3-char floor if we still have nothing.
  if (cards.length < maxCards) {
    const termFreq = new Map<string, number>();
    for (const tok of tokenize(text)) {
      const key = tok.toLowerCase();
      termFreq.set(key, (termFreq.get(key) ?? 0) + 1);
    }
    const scored = [...sentences].sort(
      (a, b) => informativeScore(b) - informativeScore(a),
    );
    const tryCloze = (minLen: number) => {
      for (const sent of scored) {
        if (cards.length >= maxCards) break;
        const term = pickClozeTerm(sent, termFreq, minLen);
        if (!term) continue;
        const card = makeClozeCard(sent, term);
        if (!card) continue;
        addCard(card.front, card.back);
      }
    };
    tryCloze(4);
    if (cards.length === 0) tryCloze(3);
  }

  // Strategy 4, last resort: take the longest words and pair each with the
  // sentence they appear in. Guarantees a non-empty result as long as the
  // text has any meaningful tokens at all.
  if (cards.length === 0) {
    const tokens = tokenize(text)
      .filter((t) => t.length >= 3 && !isStopword(t))
      .sort((a, b) => b.length - a.length);
    const longBlob = text.replace(/\s+/g, " ").trim();
    const seen = new Set<string>();
    for (const tok of tokens) {
      if (cards.length >= maxCards) break;
      const key = tok.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const re = new RegExp(`\\b${escapeRegex(tok)}\\b`);
      const match = longBlob.match(
        new RegExp(`[^.!?\\n]{0,80}\\b${escapeRegex(tok)}\\b[^.!?\\n]{0,80}`),
      );
      const context = match ? match[0].trim() : longBlob.slice(0, 160);
      const front = context.replace(re, "_____");
      addCard(front, tok);
    }
  }

  return cards.slice(0, maxCards);
}

export function estimateMaxCards(text: string): number {
  const sentences = splitSentences(text);
  // Count the GENUINE term/definition cards the source actually contains. We
  // deliberately exclude cloze fill-in-the-blank padding: the extractor can
  // generate those almost without limit, so including them would over-promise
  // the count. Dedupe by term so repeated mentions don't inflate it.
  const seenTerms = new Set<string>();
  let defs = 0;
  for (const sent of sentences) {
    for (const [term] of extractDefinitionPairs(sent)) {
      const k = term.toLowerCase().trim();
      if (k && !seenTerms.has(k)) {
        seenTerms.add(k);
        defs++;
      }
    }
    for (const [term] of extractColonDashPairs(sent)) {
      const k = term.toLowerCase().trim();
      if (k && !seenTerms.has(k)) {
        seenTerms.add(k);
        defs++;
      }
    }
  }
  // DISTINCT informative sentences (deduped so repeated text can't inflate it).
  const richSet = new Set<string>();
  for (const s of sentences) {
    if (informativeScore(s) >= 3.0) {
      richSet.add(s.toLowerCase().replace(/\s+/g, " ").trim());
    }
  }
  // Distinct testable content drives the number, NOT raw length. A long-but-
  // repetitive source can't over-promise, and a short-but-dense one isn't
  // unfairly capped. The 5..30 clamp bounds the extremes.
  const facts = Math.max(defs, richSet.size);
  return Math.max(5, Math.min(30, facts || 5));
}
