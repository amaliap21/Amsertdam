"""
Flashcard Extractor, turn raw text into front/back flashcards without any AI.

Strategies, applied in order until we have enough cards:
    1. Definition patterns:  "X is Y" / "X are Y" / "X means Y" /
                             "X refers to Y" / "X is defined as Y"
    2. Colon/dash patterns:  "X: Y" / "X, Y" / "X – Y"
    3. Parenthetical:        "X (also known as Y) ..."
    4. Cloze fallback:       pick informative sentences and blank out the
                             most-distinctive noun-phrase as the answer.

Each strategy is deterministic and keeps the original wording. Cards are
deduplicated by their front string (case-insensitive) so we never repeat
the same question.

Quality knobs at the top of the file, tune length thresholds, stop-words,
and term-extraction patterns there.
"""

from http.server import BaseHTTPRequestHandler
import json
import re
from collections import Counter


# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------

MIN_TERM_LEN = 2
MAX_TERM_LEN = 60
MIN_DEFINITION_LEN = 10
MAX_DEFINITION_LEN = 280
MIN_CLOZE_SENTENCE_LEN = 40
MAX_CLOZE_SENTENCE_LEN = 220


# Common English+Indonesian stop-words. Used to filter out boring "terms"
# that would otherwise dominate definition matches.
STOP_WORDS = {
    "the", "a", "an", "of", "to", "and", "or", "but", "in", "on", "at", "by",
    "for", "with", "as", "is", "are", "was", "were", "be", "been", "being",
    "this", "that", "these", "those", "it", "its", "we", "you", "they",
    "i", "he", "she", "his", "her", "their", "our", "us", "them", "me",
    "if", "then", "else", "when", "where", "how", "why", "what", "which",
    "who", "whose", "whom", "all", "any", "some", "no", "not", "only",
    "do", "does", "did", "have", "has", "had", "will", "would", "could",
    "should", "may", "might", "can", "must", "shall", "from", "up", "out",
    "so", "than", "too", "very", "just", "also", "such", "more", "most",
    # Indonesian common words
    "yang", "dan", "atau", "tetapi", "adalah", "ialah", "ini", "itu", "untuk",
    "pada", "di", "ke", "dari", "dengan", "oleh", "tidak", "ada", "akan",
    "telah", "sudah", "bisa", "dapat", "harus", "seperti", "juga", "saya",
    "kamu", "dia", "mereka", "kami", "kita", "sebuah", "satu", "dua", "tiga",
}


# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------

def split_sentences(text: str) -> list[str]:
    """
    Split text into sentences. We use a permissive split on `.!?` followed
    by whitespace + capital-letter, which handles most prose without needing
    a fancy NLP library.
    """
    # Normalize whitespace first.
    text = re.sub(r"\s+", " ", text.strip())
    # Split on sentence-ending punctuation followed by a space and a capital
    # letter or quote. Keep the punctuation with the preceding sentence.
    parts = re.split(r"(?<=[.!?])\s+(?=[A-ZА-Я\"'(])", text)
    return [p.strip() for p in parts if len(p.strip()) > 10]


WORD_RE = re.compile(r"[A-Za-z][A-Za-z\-']{1,}")


def tokenize(text: str) -> list[str]:
    return WORD_RE.findall(text)


def is_stopword(token: str) -> bool:
    return token.lower() in STOP_WORDS


def clean_term(term: str) -> str:
    """Normalize a candidate term: trim, strip dangling articles, collapse spaces."""
    term = re.sub(r"\s+", " ", term).strip(" ,;:-—–\"'()")
    # Drop a leading article if it crept in.
    term = re.sub(r"^(?:a|an|the)\s+", "", term, flags=re.I)
    return term


def is_useful_term(term: str) -> bool:
    if not term or len(term) < MIN_TERM_LEN or len(term) > MAX_TERM_LEN:
        return False
    if term.isdigit():
        return False
    tokens = WORD_RE.findall(term)
    if not tokens:
        return False
    # If every token is a stop-word, the "term" is junk.
    if all(is_stopword(t) for t in tokens):
        return False
    # Reject if it's a full sentence pretending to be a term.
    if len(tokens) > 6:
        return False
    return True


def is_useful_definition(definition: str) -> bool:
    if not definition:
        return False
    if len(definition) < MIN_DEFINITION_LEN or len(definition) > MAX_DEFINITION_LEN:
        return False
    if not WORD_RE.search(definition):
        return False
    return True


# ---------------------------------------------------------------------------
# Strategy 1: definition verbs ("X is Y")
# ---------------------------------------------------------------------------

DEFINITION_VERBS = (
    "is", "are", "was", "were",
    "means", "refers to", "denotes", "represents",
    "is defined as", "is known as", "is called",
    "consists of", "comprises", "describes",
    # Indonesian
    "adalah", "ialah", "merupakan", "yaitu", "didefinisikan sebagai",
)

DEFINITION_VERB_PATTERN = r"|".join(re.escape(v) for v in DEFINITION_VERBS)


def extract_definition_pairs(sentence: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    # "X <verb> Y"
    m = re.match(
        rf"^\s*(.+?)\s+(?:{DEFINITION_VERB_PATTERN})\s+(.+?)\s*[.!?]?\s*$",
        sentence,
        re.IGNORECASE,
    )
    if m:
        term = clean_term(m.group(1))
        defn = m.group(2).strip().rstrip(".!?")
        if is_useful_term(term) and is_useful_definition(defn):
            pairs.append((term, defn))
    return pairs


# ---------------------------------------------------------------------------
# Strategy 2: colon / dash definitions
# ---------------------------------------------------------------------------

COLON_DASH_PATTERN = re.compile(
    r"^\s*([A-ZА-Я][\w\s\-]{1,60})\s*[:\-—–]\s*(.{10,280})$",
)


def extract_colon_dash_pairs(sentence: str) -> list[tuple[str, str]]:
    m = COLON_DASH_PATTERN.match(sentence)
    if not m:
        return []
    term = clean_term(m.group(1))
    defn = m.group(2).strip().rstrip(".!?")
    if is_useful_term(term) and is_useful_definition(defn):
        return [(term, defn)]
    return []


# ---------------------------------------------------------------------------
# Strategy 3: cloze deletion fallback
# ---------------------------------------------------------------------------

def informative_score(sentence: str) -> float:
    """
    Heuristic for "how flashcard-worthy is this sentence?".
    Higher = better candidate for cloze deletion.
    """
    tokens = tokenize(sentence)
    if not tokens:
        return 0.0
    capitalized = sum(1 for t in tokens if t[0].isupper())
    long_tokens = sum(1 for t in tokens if len(t) >= 6)
    has_number = bool(re.search(r"\b\d{2,}\b", sentence))
    score = capitalized * 1.0 + long_tokens * 0.5 + (2.0 if has_number else 0.0)
    # Penalize very short or very long sentences.
    if len(sentence) < MIN_CLOZE_SENTENCE_LEN:
        score *= 0.3
    if len(sentence) > MAX_CLOZE_SENTENCE_LEN:
        score *= 0.5
    return score


def pick_cloze_term(sentence: str, term_freq: Counter) -> str | None:
    """
    Pick the most distinctive multi-character word in the sentence:
    proper nouns, technical terms, or any rare-ish word.
    """
    tokens = WORD_RE.findall(sentence)
    candidates: list[tuple[float, str]] = []
    for tok in tokens:
        if len(tok) < 4 or is_stopword(tok):
            continue
        freq = term_freq.get(tok.lower(), 1)
        rarity = 1.0 / freq
        cap_bonus = 0.5 if tok[0].isupper() else 0.0
        length_bonus = (len(tok) - 4) * 0.1
        score = rarity + cap_bonus + length_bonus
        candidates.append((score, tok))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def make_cloze_card(sentence: str, term: str) -> dict | None:
    # Replace the first whole-word occurrence of `term` with a blank.
    pattern = re.compile(rf"\b{re.escape(term)}\b")
    if not pattern.search(sentence):
        return None
    cloze = pattern.sub("_____", sentence, count=1)
    return {"front": cloze, "back": term}


# ---------------------------------------------------------------------------
# Main entry
# ---------------------------------------------------------------------------

def extract_flashcards(text: str, max_cards: int = 10) -> list[dict]:
    sentences = split_sentences(text)
    cards: list[dict] = []
    seen_fronts: set[str] = set()

    def add_card(front: str, back: str) -> None:
        key = front.lower().strip()
        if key in seen_fronts:
            return
        seen_fronts.add(key)
        cards.append({"front": front, "back": back})

    # Strategy 1 + 2, definition patterns.
    for sent in sentences:
        if len(cards) >= max_cards:
            break
        for term, defn in extract_definition_pairs(sent):
            add_card(f"What is {term}?", defn)
            if len(cards) >= max_cards:
                break
        for term, defn in extract_colon_dash_pairs(sent):
            add_card(f"Define: {term}", defn)
            if len(cards) >= max_cards:
                break

    # Strategy 3, cloze fallback for whatever's missing.
    if len(cards) < max_cards:
        # Build a frequency table once so cloze picks rare terms.
        term_freq: Counter = Counter()
        for tok in tokenize(text):
            term_freq[tok.lower()] += 1

        scored = sorted(
            sentences,
            key=informative_score,
            reverse=True,
        )
        for sent in scored:
            if len(cards) >= max_cards:
                break
            term = pick_cloze_term(sent, term_freq)
            if not term:
                continue
            card = make_cloze_card(sent, term)
            if not card:
                continue
            add_card(card["front"], card["back"])

    return cards[:max_cards]


def estimate_max_cards(text: str) -> int:
    """How many cards could we plausibly extract? Used by the analyzer pass."""
    sentences = split_sentences(text)
    rich = sum(1 for s in sentences if informative_score(s) >= 3.0)
    word_count = len(tokenize(text))
    # Bound between 5 and 30. Words/60 is a rough "concept density" proxy.
    return max(5, min(30, max(rich, word_count // 60)))


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
            requested = int(data.get("requestedCards", 0) or 0)
            if not text:
                self._send_json(400, {"error": "Missing 'text' field"})
                return
            max_cards = estimate_max_cards(text)
            if mode == "analyze":
                self._send_json(200, {"maxCards": max_cards})
                return
            n = requested if requested > 0 else max_cards
            n = max(1, min(max_cards, n))
            cards = extract_flashcards(text, max_cards=n)
            self._send_json(200, {"cards": cards, "maxCards": max_cards})
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})


if __name__ == "__main__":
    sample = (
        "Photosynthesis is the process by which green plants convert sunlight "
        "into chemical energy. Chlorophyll is the green pigment found in "
        "chloroplasts. The Calvin cycle: a series of light-independent "
        "reactions that fix carbon dioxide into sugar. Mitochondria produce "
        "ATP through cellular respiration. The genome contains all the "
        "hereditary information of an organism."
    )
    out = extract_flashcards(sample, max_cards=5)
    print(json.dumps({"cards": out, "max": estimate_max_cards(sample)}, indent=2))
