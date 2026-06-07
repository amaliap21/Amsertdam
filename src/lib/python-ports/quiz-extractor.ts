// TypeScript port of api/python/quiz_extractor.py. Runs in the Next runtime
// so `next dev` works without deploying Python. Algorithm matches Python
// 1:1, definition-style MCQs first, then cloze fill-in-the-blank.

import {
  DEFINITION_VERB_PATTERN,
  informativeScore,
  isSectionHeading,
  pickClozeTerm,
  splitSentences,
  tokenize,
  WORD_RE,
  type Language,
} from "./flashcard-extractor";

export type { Language };

const QUIZ_PROMPTS: Record<Language, { cloze: (s: string) => string; describe: (t: string) => string }> = {
  en: {
    cloze: (s) => `Fill in the blank: ${s}`,
    describe: (t) => `What best describes ${t}?`,
  },
  id: {
    cloze: (s) => `Isi titik-titik: ${s}`,
    describe: (t) => `Apa yang paling tepat menggambarkan ${t}?`,
  },
};

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
  "yang","dan","atau","tetapi","adalah","ialah","ini","itu","untuk",
  "pada","di","ke","dari","dengan","oleh","tidak","ada","akan",
  "telah","sudah","bisa","dapat","harus","seperti","juga","saya",
  "kamu","dia","mereka","kami","kita","sebuah","satu","dua","tiga",
]);

const MIN_QUESTIONS = 4;
const MAX_QUESTIONS = 25;
const DISTRACTORS_PER_QUESTION = 3;

// Transition / connective words. A "term" that starts with one of these is a
// sentence fragment ("Sehingga ...", "Oleh karena itu ...", "Pertama ..."), not
// a real concept, so we reject it as a quiz term.
const TERM_BLOCK_STARTERS = new Set<string>([
  // Indonesian
  "sehingga", "oleh", "selain", "namun", "jadi", "maka", "kemudian", "selanjutnya",
  "berikutnya", "adapun", "pertama", "kedua", "ketiga", "keempat", "kelima",
  "untuk", "dalam", "dengan", "secara", "pada", "misalnya", "contohnya", "semua",
  "bagaimana", "apa", "mengapa", "kenapa", "akan", "tetapi", "sebagai", "karena",
  "selama", "setelah", "sebelum", "ketika", "saat", "yakni", "yaitu", "ialah",
  // English
  "therefore", "however", "moreover", "furthermore", "first", "second", "third",
  "thus", "hence", "also", "besides", "meanwhile", "additionally", "consequently",
  "what", "how", "why", "when", "where", "which",
]);

// Academic credentials / honorifics that mark an author/lecturer name line.
const CREDENTIAL_RE = /\b(?:S\.?T|M\.?T|S\.?Kom|M\.?Kom|Ph\.?\s?D|S\.?E|M\.?M|S\.?Si|M\.?Si|S\.?Sos|M\.?Sc|B\.?Sc|Dr|Prof|Ir)\.?\b/i;

export type Letter = "A" | "B" | "C" | "D";
export type QuizQuestion = {
  id: string;
  prompt: string;
  options: Array<{ letter: Letter; text: string }>;
  correctAnswer: Letter;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanTerm(term: string): string {
  let t = term.replace(/\s+/g, " ").trim();
  t = t.replace(/^[\s,;:\-, –"'()]+|[\s,;:\-, –"'()]+$/g, "");
  t = t.replace(/^(?:a|an|the)\s+/i, "");
  return t;
}

const DEF_VERB_RE = new RegExp(`\\b(?:${DEFINITION_VERB_PATTERN})\\b`, "i");

function isUsefulTerm(term: string): boolean {
  if (!term || term.length < 2 || term.length > 60) return false;
  if (/\d$/.test(term)) return false; // trailing number -> TOC / page reference
  if (/^\d+$/.test(term)) return false;
  if (isSectionHeading(term)) return false;
  // A real term is a short noun phrase, not a clause fragment.
  const tokens = term.match(WORD_RE) ?? [];
  if (tokens.length === 0 || tokens.length > 4) return false;
  if (tokens.every((t) => STOP_WORDS.has(t.toLowerCase()))) return false;
  // Reject fragments that begin with a transition/connective/question word.
  if (TERM_BLOCK_STARTERS.has((tokens[0] ?? "").toLowerCase())) return false;
  // Reject clauses that swallowed a definition verb (e.g. "X adalah Y").
  if (DEF_VERB_RE.test(term)) return false;
  // Reject author/lecturer name lines with academic credentials.
  if (CREDENTIAL_RE.test(term)) return false;
  // Need at least one substantive (non-stopword, >=4 char) token.
  if (!tokens.some((t) => t.length >= 4 && !STOP_WORDS.has(t.toLowerCase()))) return false;
  return true;
}

function isUsefulDefinition(defn: string): boolean {
  if (!defn) return false;
  if (defn.length < 20 || defn.length > 280) return false;
  const hasWord = WORD_RE.test(defn);
  WORD_RE.lastIndex = 0;
  if (!hasWord) return false;
  // Reject definitions that look like PDF metadata leftovers.
  if (/@|\bdoi\b|\bissn\b|\bpage\s*\d+\b|\bvol\.?\s*\d+\b/i.test(defn)) return false;
  // Reject author/credential lines and question fragments masquerading as defns.
  if (CREDENTIAL_RE.test(defn)) return false;
  if (/[?]\s*\d*\s*$/.test(defn)) return false; // ends with a question mark
  if (/\d$/.test(defn.trim())) return false; // trailing page/list number
  const firstTok = (defn.match(WORD_RE) ?? [])[0]?.toLowerCase();
  if (firstTok && TERM_BLOCK_STARTERS.has(firstTok)) return false; // fragment
  const wordChars = (defn.match(/[A-Za-zА-Я]/g) ?? []).length;
  if (wordChars < defn.length * 0.5) return false;
  return true;
}

// ---------- definition harvesting ----------

function harvestDefinitions(text: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const seen = new Set<string>();
  const re = new RegExp(
    `^\\s*(.+?)\\s+(?:${DEFINITION_VERB_PATTERN})\\s+(.+?)\\s*[.!?]?\\s*$`,
    "i",
  );
  for (const sent of splitSentences(text)) {
    const m = sent.match(re);
    if (!m) continue;
    const term = cleanTerm(m[1]);
    const defn = m[2].trim().replace(/[.!?]+$/, "");
    if (!isUsefulTerm(term) || !isUsefulDefinition(defn)) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([term, defn]);
  }
  return pairs;
}

// ---------- seeded RNG (mulberry32) so quizzes are reproducible ----------

function makeRng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------- distractor sampling ----------

function sampleDistractors(
  pool: string[],
  correct: string,
  n: number,
  rng: () => number,
): string[] {
  const correctLower = correct.toLowerCase().trim();
  const correctLen = correct.length;
  const ranked: Array<[number, string]> = [];
  for (const c of pool) {
    const cl = c.toLowerCase().trim();
    if (cl === correctLower || !c.trim()) continue;
    ranked.push([Math.abs(c.length - correctLen), c]);
  }
  ranked.sort((a, b) => a[0] - b[0]);
  const head = ranked.slice(0, Math.max(n * 3, 10)).map(([, s]) => s);
  if (head.length <= n) return head;
  const shuffled = shuffle(head, rng);
  const chosen: string[] = [];
  const chosenLower = new Set<string>();
  for (const c of shuffled) {
    const cl = c.toLowerCase().trim();
    if (chosenLower.has(cl)) continue;
    chosen.push(c);
    chosenLower.add(cl);
    if (chosen.length >= n) break;
  }
  return chosen;
}

// ---------- question builders ----------

function buildClozeQuestion(
  sentence: string,
  termFreq: Map<string, number>,
  termPool: string[],
  rng: () => number,
  language: Language,
): QuizQuestion | null {
  const term = pickClozeTerm(sentence, termFreq);
  if (!term) return null;
  const re = new RegExp(`\\b${escapeRegex(term)}\\b`);
  if (!re.test(sentence)) return null;
  const prompt = sentence.replace(re, "_____").trim();
  const distractors = sampleDistractors(termPool, term, DISTRACTORS_PER_QUESTION, rng);
  if (distractors.length < DISTRACTORS_PER_QUESTION) return null;
  const options = shuffle([term, ...distractors], rng);
  const letters: Letter[] = ["A", "B", "C", "D"];
  const correctIdx = options.indexOf(term);
  return {
    id: "",
    prompt: QUIZ_PROMPTS[language].cloze(prompt),
    options: options.map((text, i) => ({ letter: letters[i], text })),
    correctAnswer: letters[correctIdx],
  };
}

function buildDefinitionQuestion(
  term: string,
  defn: string,
  allDefinitions: string[],
  rng: () => number,
  language: Language,
): QuizQuestion | null {
  const distractors = sampleDistractors(allDefinitions, defn, DISTRACTORS_PER_QUESTION, rng);
  if (distractors.length < DISTRACTORS_PER_QUESTION) return null;
  const options = shuffle([defn, ...distractors], rng);
  const letters: Letter[] = ["A", "B", "C", "D"];
  const correctIdx = options.indexOf(defn);
  return {
    id: "",
    prompt: QUIZ_PROMPTS[language].describe(term),
    options: options.map((text, i) => ({ letter: letters[i], text })),
    correctAnswer: letters[correctIdx],
  };
}

// ---------- main entry ----------

export function extractQuiz(
  text: string,
  numQuestions = 5,
  seed = 0,
  language: Language = "en",
): QuizQuestion[] {
  const rng = makeRng(seed);
  const sentences = splitSentences(text);

  // Term pool for cloze distractors.
  const seenTerms = new Set<string>();
  const termPool: string[] = [];
  for (const tok of tokenize(text)) {
    if (tok.length < 4 || STOP_WORDS.has(tok.toLowerCase())) continue;
    const tl = tok.toLowerCase();
    if (seenTerms.has(tl)) continue;
    seenTerms.add(tl);
    termPool.push(tok);
  }

  const definitionPairs = harvestDefinitions(text);
  const allDefinitions = definitionPairs.map(([, defn]) => defn);

  const termFreq = new Map<string, number>();
  for (const tok of tokenize(text)) {
    const k = tok.toLowerCase();
    termFreq.set(k, (termFreq.get(k) ?? 0) + 1);
  }

  const questions: QuizQuestion[] = [];
  const seenPrompts = new Set<string>();
  const addQuestion = (q: QuizQuestion | null) => {
    if (!q) return;
    const key = q.prompt.toLowerCase().trim();
    if (seenPrompts.has(key)) return;
    seenPrompts.add(key);
    questions.push(q);
  };

  // 1. Definition-style questions.
  if (allDefinitions.length >= DISTRACTORS_PER_QUESTION + 1) {
    for (const [term, defn] of definitionPairs) {
      if (questions.length >= numQuestions) break;
      addQuestion(buildDefinitionQuestion(term, defn, allDefinitions, rng, language));
    }
  }

  // 2. Cloze fill-in-the-blank to fill remaining slots.
  if (questions.length < numQuestions) {
    const scored = [...sentences].sort(
      (a, b) => informativeScore(b) - informativeScore(a),
    );
    for (const sent of scored) {
      if (questions.length >= numQuestions) break;
      addQuestion(buildClozeQuestion(sent, termFreq, termPool, rng, language));
    }
  }

  // Stable per-question ids.
  return questions.slice(0, numQuestions).map((q, i) => ({
    ...q,
    id: `q${i + 1}`,
  }));
}

export function estimateMaxQuestions(text: string): number {
  const sentences = splitSentences(text);
  // DISTINCT informative sentences. Deduping matters: repeated text (headers,
  // boilerplate, copy-pasted paragraphs) must not inflate the count.
  const richSet = new Set<string>();
  for (const s of sentences) {
    if (informativeScore(s) >= 3.0) {
      richSet.add(s.toLowerCase().replace(/\s+/g, " ").trim());
    }
  }
  const defs = harvestDefinitions(text).length; // already deduped by term
  // The realistic number of questions is how many DISTINCT testable facts the
  // source contains (informative sentences / definitions), NOT its raw length.
  // A long-but-repetitive source therefore can't over-promise, and a short-but-
  // dense one isn't unfairly capped. MIN/MAX bound the extremes.
  const facts = Math.max(richSet.size, defs);
  return Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, facts || MIN_QUESTIONS));
}
