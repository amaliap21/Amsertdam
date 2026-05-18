"""
Quiz Extractor — generate multiple-choice questions from raw text without
any AI. Uses cloze deletion: take an informative sentence, blank out the
most-distinctive term, and offer 3 distractors drawn from the rest of the
document.

Two prompt styles, depending on what the sentence contains:
  • Cloze:        "Photosynthesis is the process by which green plants
                   convert _____ into chemical energy."
                   correct = "sunlight"
  • Definition:   "What is photosynthesis?"
                   correct = "the process by which green plants convert ..."
                   distractors = 3 other definitions from the same source

Distractors are chosen to be plausible (similar length, similar token shape)
but provably wrong (they're real terms/definitions from elsewhere in the
document, so the student can't trivially eliminate them by guessing
"the longest option").
"""

from http.server import BaseHTTPRequestHandler
import json
import random
import re
from collections import Counter

from flashcard_extractor import (
    DEFINITION_VERB_PATTERN,
    MIN_TERM_LEN,
    MAX_TERM_LEN,
    MIN_DEFINITION_LEN,
    MAX_DEFINITION_LEN,
    STOP_WORDS,
    WORD_RE,
    clean_term,
    informative_score,
    is_stopword,
    is_useful_definition,
    is_useful_term,
    pick_cloze_term,
    split_sentences,
    tokenize,
)


# ---------------------------------------------------------------------------
# Tuning
# ---------------------------------------------------------------------------

MIN_QUESTIONS = 4
MAX_QUESTIONS = 25
DISTRACTORS_PER_QUESTION = 3


# ---------------------------------------------------------------------------
# Definition harvesting (used for definition-style questions + distractor pool)
# ---------------------------------------------------------------------------

def harvest_definitions(text: str) -> list[tuple[str, str]]:
    """Find every '<term> <verb> <definition>' pair in the text."""
    pairs: list[tuple[str, str]] = []
    seen: set[str] = set()
    for sent in split_sentences(text):
        m = re.match(
            rf"^\s*(.+?)\s+(?:{DEFINITION_VERB_PATTERN})\s+(.+?)\s*[.!?]?\s*$",
            sent,
            re.IGNORECASE,
        )
        if not m:
            continue
        term = clean_term(m.group(1))
        defn = m.group(2).strip().rstrip(".!?")
        if not is_useful_term(term) or not is_useful_definition(defn):
            continue
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        pairs.append((term, defn))
    return pairs


# ---------------------------------------------------------------------------
# Distractor sampling
# ---------------------------------------------------------------------------

def sample_distractors(
    pool: list[str],
    correct: str,
    n: int,
    rng: random.Random,
) -> list[str]:
    """
    Pick n entries from `pool` that look superficially similar to `correct`
    (similar length, distinct text) but aren't `correct`. Returns fewer than
    n if the pool is too small.
    """
    correct_lower = correct.lower().strip()
    correct_len = len(correct)
    # Rank pool members by length-similarity to the correct answer.
    candidates = []
    for c in pool:
        cl = c.lower().strip()
        if cl == correct_lower or not c.strip():
            continue
        diff = abs(len(c) - correct_len)
        candidates.append((diff, c))
    candidates.sort()
    # Take the top 3*n by length-similarity, then sample n.
    head = [c for _, c in candidates[: max(n * 3, 10)]]
    if len(head) <= n:
        return head
    rng.shuffle(head)
    chosen: list[str] = []
    chosen_lower: set[str] = set()
    for c in head:
        cl = c.lower().strip()
        if cl in chosen_lower:
            continue
        chosen.append(c)
        chosen_lower.add(cl)
        if len(chosen) >= n:
            break
    return chosen


# ---------------------------------------------------------------------------
# Question builders
# ---------------------------------------------------------------------------

def build_cloze_question(
    sentence: str,
    term_freq: Counter,
    term_pool: list[str],
    rng: random.Random,
) -> dict | None:
    term = pick_cloze_term(sentence, term_freq)
    if not term:
        return None
    # Replace the term with a blank in the sentence.
    pattern = re.compile(rf"\b{re.escape(term)}\b")
    if not pattern.search(sentence):
        return None
    prompt = pattern.sub("_____", sentence, count=1).strip()
    distractors = sample_distractors(term_pool, term, DISTRACTORS_PER_QUESTION, rng)
    if len(distractors) < DISTRACTORS_PER_QUESTION:
        return None
    options = [term, *distractors]
    rng.shuffle(options)
    letters = ["A", "B", "C", "D"]
    correct_letter = letters[options.index(term)]
    return {
        "prompt": f"Fill in the blank: {prompt}",
        "options": [{"letter": letters[i], "text": options[i]} for i in range(4)],
        "correctAnswer": correct_letter,
    }


def build_definition_question(
    term: str,
    defn: str,
    all_definitions: list[str],
    rng: random.Random,
) -> dict | None:
    distractors = sample_distractors(all_definitions, defn, DISTRACTORS_PER_QUESTION, rng)
    if len(distractors) < DISTRACTORS_PER_QUESTION:
        return None
    options = [defn, *distractors]
    rng.shuffle(options)
    letters = ["A", "B", "C", "D"]
    correct_letter = letters[options.index(defn)]
    return {
        "prompt": f"What best describes {term}?",
        "options": [{"letter": letters[i], "text": options[i]} for i in range(4)],
        "correctAnswer": correct_letter,
    }


# ---------------------------------------------------------------------------
# Main entry
# ---------------------------------------------------------------------------

def extract_quiz(text: str, num_questions: int = 5, seed: int = 0) -> list[dict]:
    rng = random.Random(seed)
    sentences = split_sentences(text)

    # Term-pool for cloze distractors: every alphabetic word of length >= 4
    # that isn't a stop-word. Dedup case-insensitively, keep original case.
    seen_terms: set[str] = set()
    term_pool: list[str] = []
    for tok in tokenize(text):
        if len(tok) < 4 or is_stopword(tok):
            continue
        tl = tok.lower()
        if tl in seen_terms:
            continue
        seen_terms.add(tl)
        term_pool.append(tok)

    # Definition pool — both for definition-style questions and as a
    # distractor reservoir when phrasing as "What best describes X?".
    definition_pairs = harvest_definitions(text)
    all_definitions = [defn for _, defn in definition_pairs]

    # Term frequency for cloze ranking.
    term_freq: Counter = Counter()
    for tok in tokenize(text):
        term_freq[tok.lower()] += 1

    questions: list[dict] = []
    seen_prompts: set[str] = set()

    def add_question(q: dict | None) -> None:
        if not q:
            return
        key = q["prompt"].lower().strip()
        if key in seen_prompts:
            return
        seen_prompts.add(key)
        questions.append(q)

    # 1. Definition-style questions first — they tend to read more naturally
    # than cloze questions.
    if len(all_definitions) >= DISTRACTORS_PER_QUESTION + 1:
        for term, defn in definition_pairs:
            if len(questions) >= num_questions:
                break
            add_question(build_definition_question(term, defn, all_definitions, rng))

    # 2. Cloze fill-in-the-blank questions to fill the rest.
    if len(questions) < num_questions:
        scored = sorted(sentences, key=informative_score, reverse=True)
        for sent in scored:
            if len(questions) >= num_questions:
                break
            add_question(build_cloze_question(sent, term_freq, term_pool, rng))

    return questions[:num_questions]


def estimate_max_questions(text: str) -> int:
    sentences = split_sentences(text)
    rich = sum(1 for s in sentences if informative_score(s) >= 3.0)
    defs = len(harvest_definitions(text))
    word_count = len(tokenize(text))
    rough = max(rich, defs, word_count // 80)
    return max(MIN_QUESTIONS, min(MAX_QUESTIONS, rough))


# ---------------------------------------------------------------------------
# Vercel HTTP handler
# ---------------------------------------------------------------------------

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002
        pass

    def _send_json(self, status: int, body: dict):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            data = json.loads(raw)
            text = str(data.get("text", "")).strip()
            mode = str(data.get("mode", "generate"))
            requested = int(data.get("requestedQuestions", 0) or 0)
            seed = int(data.get("seed", 0) or 0)
            if not text:
                self._send_json(400, {"error": "Missing 'text' field"})
                return
            max_q = estimate_max_questions(text)
            if mode == "analyze":
                self._send_json(200, {"maxQuestions": max_q})
                return
            n = requested if requested > 0 else max_q
            n = max(1, min(max_q, n))
            questions = extract_quiz(text, num_questions=n, seed=seed)
            # Attach a stable id per question for the frontend.
            for i, q in enumerate(questions):
                q["id"] = f"q{i + 1}"
            self._send_json(200, {"questions": questions, "maxQuestions": max_q})
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})


if __name__ == "__main__":
    sample = (
        "Photosynthesis is the process by which green plants convert sunlight "
        "into chemical energy. Chlorophyll is the green pigment found in "
        "chloroplasts. The Calvin cycle is a series of light-independent "
        "reactions that fix carbon dioxide into sugar. Mitochondria are "
        "the powerhouse of the cell that produce ATP through cellular "
        "respiration. The genome refers to all the hereditary information "
        "of an organism. DNA is the molecule that carries genetic "
        "instructions. RNA is involved in protein synthesis."
    )
    qs = extract_quiz(sample, num_questions=4, seed=42)
    print(json.dumps(qs, indent=2))
