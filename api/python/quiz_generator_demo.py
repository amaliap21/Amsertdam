"""
Quiz Generator Demo (CLI)
-------------------------
Runs the production LLM quiz pipeline against a local PDF and prints the
result. Useful for inspecting what the model actually returns for a real
document, without needing the Next dev server / a Supabase session.

Pipeline mirrors src/app/api/ai/quiz/generate/route.ts:
    1. Extract text from the PDF (pypdf, deterministic).
    2. Call OpenRouter with the same system prompt + model chain.
    3. Regex polisher (src/lib/ai/polish.ts ported below) normalizes
       LLM artifacts: strips option prefixes, markdown, smart quotes,
       leading numbering, reassigns A/B/C/D positionally, re-resolves
       correctAnswer.
    4. Print the polished questions + the raw JSON.

Usage:
    py -3 api/python/quiz_generator_demo.py "C:\\path\\to\\file.pdf"
    py -3 api/python/quiz_generator_demo.py "file.pdf" --n 5 --model anthropic/claude-opus-4-7

Requires:
    pip install pypdf
    OPENROUTER_API_KEY in .env (already present in this project)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import textwrap
import urllib.request
import urllib.error
from pathlib import Path

# Windows consoles default to cp1252, which can't render ± / ✓ / ✗ / ✔.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass


# ---------------------------------------------------------------------------
# Minimal .env loader (no python-dotenv dependency)
# ---------------------------------------------------------------------------

def load_dotenv(env_path: Path) -> dict[str, str]:
    """Parse a .env file into a dict. Values may be unquoted, single, or
    double-quoted. Lines starting with # are comments."""
    if not env_path.exists():
        return {}
    out: dict[str, str] = {}
    for raw_line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        # Strip a single matching pair of surrounding quotes.
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        out[key] = value
    return out


# ---------------------------------------------------------------------------
# PDF text extraction
# ---------------------------------------------------------------------------

def extract_pdf_text(pdf_path: Path) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError:
        print(
            "ERROR: pypdf is not installed. Install with:\n"
            "    py -3 -m pip install pypdf",
            file=sys.stderr,
        )
        sys.exit(1)

    reader = PdfReader(str(pdf_path))
    chunks: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        chunks.append(text)
    return "\n\n".join(chunks)


def tidy_source_text(raw: str) -> str:
    """Mirror the tidyText() helper in the Next route."""
    out = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", " ", raw)
    out = re.sub(r"[ \t]+", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


# ---------------------------------------------------------------------------
# Polish (Python port of src/lib/ai/polish.ts — quiz half)
# ---------------------------------------------------------------------------

_LEADING_BULLET   = re.compile(r"^\s*(?:[-*•·▪◦]|[(\[]?\d{1,3}[.)\]:\-])\s+")
_LEADING_QA_LABEL = re.compile(
    r"^\s*(?:q(?:uestion)?|a(?:nswer)?|front|back|prompt)\s*[:.\-)]\s*",
    re.IGNORECASE,
)
_MD_BOLD          = re.compile(r"\*\*([^*]+)\*\*")
_MD_ITALIC_STAR   = re.compile(r"(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)")
_MD_ITALIC_UNDER  = re.compile(r"(^|[^\w_])_([^_\n]+)_(?=[^\w_]|$)")
_MD_CODE_TICK     = re.compile(r"`([^`]+)`")
_OPTION_PREFIX    = re.compile(r"^\s*[(\[]?([A-D])[)\].:\-]+\s+", re.IGNORECASE)
_LETTER_HEAD      = re.compile(r"^[(\[]?([A-D])\b", re.IGNORECASE)
_CORRECT_MARKER   = re.compile(r"\((correct|right|answer)\)|✓|✔", re.IGNORECASE)


def _tidy_text(s: str) -> str:
    if not s:
        return ""
    out = str(s)
    out = (
        out.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
    )
    out = _MD_BOLD.sub(r"\1", out)
    out = _MD_ITALIC_STAR.sub(r"\1\2", out)
    out = _MD_ITALIC_UNDER.sub(r"\1\2", out)
    out = _MD_CODE_TICK.sub(r"\1", out)
    out = re.sub(r"[‘’‚‛]", "'", out)
    out = re.sub(r"[“”„‟]", '"', out)
    out = re.sub(r"[​-‍﻿]", "", out)
    out = _LEADING_BULLET.sub("", out)
    out = _LEADING_QA_LABEL.sub("", out)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def _strip_option_prefix(text: str):
    m = _OPTION_PREFIX.match(text)
    if not m:
        return None, _tidy_text(text)
    return m.group(1).upper(), _tidy_text(text[m.end():])


def _as_letter(value) -> str | None:
    if not isinstance(value, str):
        return None
    m = _LETTER_HEAD.match(value.strip().upper())
    return m.group(1) if m else None


def _resolve_correct_answer(raw: str, options):
    by_letter = _as_letter(raw)
    if by_letter and any(o["letter"] == by_letter for o in options):
        return by_letter
    target = re.sub(r"\s+", " ", _tidy_text(raw).lower())
    for o in options:
        if re.sub(r"\s+", " ", _tidy_text(o["text"]).lower()) == target:
            return o["letter"]
    return None


LETTERS = ("A", "B", "C", "D")


def polish_quiz_question(raw: dict):
    if not isinstance(raw, dict):
        return None
    prompt = _tidy_text(str(raw.get("prompt") or ""))
    if not prompt:
        return None

    raw_opts = list(raw.get("options") or [])[:6]
    seen = set()
    cleaned = []
    for opt in raw_opts:
        raw_text = opt.get("text") if isinstance(opt, dict) else None
        if not isinstance(raw_text, str) or not raw_text:
            continue
        parsed_letter, text = _strip_option_prefix(raw_text)
        if not text:
            continue
        key = re.sub(r"\s+", " ", text.lower())
        if key in seen:
            continue
        seen.add(key)
        label_letter = _as_letter(opt.get("label") if isinstance(opt, dict) else None)
        letter = label_letter or parsed_letter or LETTERS[len(cleaned)]
        cleaned.append({"letter": letter, "text": text})
        if len(cleaned) == 4:
            break

    if len(cleaned) < 4:
        return None

    options = [{"letter": LETTERS[i], "text": o["text"]} for i, o in enumerate(cleaned)]
    correct = _resolve_correct_answer(str(raw.get("correctAnswer") or ""), options)
    if not correct:
        for idx, opt in enumerate(raw_opts):
            text_val = opt.get("text") if isinstance(opt, dict) else None
            if isinstance(text_val, str) and _CORRECT_MARKER.search(text_val):
                if idx < 4:
                    return {"prompt": prompt, "options": options, "correctAnswer": LETTERS[idx]}
        return None

    return {"prompt": prompt, "options": options, "correctAnswer": correct}


def polish_payload(payload: dict) -> list[dict]:
    if not isinstance(payload, dict):
        return []
    raw_questions = payload.get("questions")
    if not isinstance(raw_questions, list):
        return []
    out = []
    seen_prompts = set()
    for q in raw_questions:
        polished = polish_quiz_question(q)
        if not polished:
            continue
        key = re.sub(r"\s+", " ", polished["prompt"].lower())
        if key in seen_prompts:
            continue
        seen_prompts.add(key)
        out.append(polished)
    return out


# ---------------------------------------------------------------------------
# OpenRouter call
# ---------------------------------------------------------------------------

# Mirrors openrouter.ts. Lead with the strongest free model, fall through.
FREE_MODEL_CHAIN = (
    "openai/gpt-oss-120b:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-4-31b-it:free",
    "openai/gpt-oss-20b:free",
    "meta-llama/llama-3.2-3b-instruct:free",
)
PREMIUM_MODEL_CHAIN = ("anthropic/claude-opus-4-7",)


def build_system_prompt(n: int) -> str:
    return " ".join([
        "You are a careful, accurate study-quiz generator that handles all subjects, including mathematics, science, and humanities.",
        'Respond ONLY with a single valid JSON object matching: {"questions":[{"prompt":"...","options":[{"letter":"A","text":"..."}],"correctAnswer":"A"}]}.',
        f"Produce up to {n} multiple-choice questions derived from the provided source. Always include exactly 4 options A/B/C/D. Keep options plausible and the correct answer grounded in the source.",
        "Read everything visible in the source: typed text, handwritten notes, diagrams, equations, and any mathematical or scientific symbols.",
        'When the source contains math: transcribe stacked fractions as "a/b", superscripts as "x^n", subscripts as "x_n", square roots as "sqrt(x)", integrals as "integral", limits as "lim", Greek letters by name (alpha, beta, pi), and inequalities exactly as drawn ("<", ">", "<=", ">=").',
        "Solve every math problem yourself before emitting it: the marked correctAnswer MUST be the mathematically correct option. Do not guess.",
        "Use plain-text math notation throughout — no LaTeX, no Unicode math glyphs. Keep distractors realistic (common algebraic slips, sign errors, off-by-one).",
        "If a region of the source is illegible, skip questions from that region rather than fabricating content.",
    ])


def call_openrouter(model: str, messages: list[dict], api_key: str, app_url: str) -> dict:
    body = json.dumps({
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 1500,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": app_url,
            "X-Title": "RealTrack Quiz CLI Demo",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def extract_first_json(raw: str) -> dict | None:
    """LLMs sometimes wrap JSON in prose or code fences. Find the first {...}."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # Find balanced braces.
    depth = 0
    start = -1
    for i, ch in enumerate(raw):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                try:
                    return json.loads(raw[start:i + 1])
                except json.JSONDecodeError:
                    start = -1
                    continue
    return None


def try_chain(chain: tuple[str, ...], messages: list[dict], api_key: str, app_url: str):
    """Try each model in order; return (model, parsed_json) on success."""
    last_error = "all models failed"
    for model in chain:
        print(f"  [llm] trying {model}…", flush=True)
        try:
            resp = call_openrouter(model, messages, api_key, app_url)
            content = (resp.get("choices") or [{}])[0].get("message", {}).get("content")
            if not content:
                print(f"        empty content, moving on")
                continue
            parsed = extract_first_json(content)
            if parsed and isinstance(parsed.get("questions"), list):
                return model, parsed, content
            print(f"        unparseable JSON, moving on")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")[:200]
            last_error = f"{e.code}: {err_body}"
            print(f"        HTTP {e.code}: {err_body[:120]}")
        except Exception as e:
            last_error = str(e)
            print(f"        error: {e}")
    return None, None, last_error


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------

LINE = "=" * 80


def print_questions(questions: list[dict], model: str) -> None:
    print()
    print(LINE)
    print(f"POLISHED QUIZ OUTPUT  (model: {model}, count: {len(questions)})")
    print(LINE)
    for idx, q in enumerate(questions, start=1):
        print(f"\nQ{idx}. {textwrap.fill(q['prompt'], width=76, subsequent_indent='    ')}")
        correct = q.get("correctAnswer", "")
        for opt in q.get("options", []):
            marker = " *" if opt["letter"] == correct else "  "
            text = textwrap.fill(opt["text"], width=70, subsequent_indent="       ")
            print(f"  {marker} {opt['letter']}. {text}")
        print(f"     correctAnswer: {correct}")
    print()
    print(LINE)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="LLM quiz generator demo.")
    parser.add_argument("pdf", help="Path to the source PDF.")
    parser.add_argument("--n", type=int, default=5, help="Number of questions (default 5).")
    parser.add_argument(
        "--model",
        default=None,
        help=(
            "OpenRouter model id (default: free chain). "
            "Pass anthropic/claude-opus-4-7 to use Claude Opus."
        ),
    )
    parser.add_argument(
        "--show-raw",
        action="store_true",
        help="Also print the raw LLM JSON before polish.",
    )
    parser.add_argument(
        "--chunk-chars",
        type=int,
        default=6000,
        help="Trim extracted PDF text to this many chars before sending (default 6000).",
    )
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.is_file():
        print(f"ERROR: not a file: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    repo_root = Path(__file__).resolve().parents[2]
    env = load_dotenv(repo_root / ".env")
    api_key = env.get("OPENROUTER_API_KEY") or os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print(
            "ERROR: OPENROUTER_API_KEY not found in .env or environment.",
            file=sys.stderr,
        )
        sys.exit(1)
    app_url = env.get("OPENROUTER_APP_URL") or "http://localhost:3000"

    print(f"\n[pdf]  reading: {pdf_path}")
    full_text = tidy_source_text(extract_pdf_text(pdf_path))
    print(f"[pdf]  extracted {len(full_text):,} characters from {pdf_path.name}")

    if len(full_text) < 40:
        print("ERROR: PDF text extraction produced almost nothing (scan PDF?).", file=sys.stderr)
        sys.exit(2)

    snippet = full_text[: args.chunk_chars]
    print(f"[llm]  sending first {len(snippet):,} chars to OpenRouter")
    print(f"[llm]  requested questions: {args.n}")

    if args.model:
        chain = (args.model,)
    else:
        chain = FREE_MODEL_CHAIN
    print(f"[llm]  chain: {' -> '.join(chain)}")

    system = build_system_prompt(args.n)
    user = f"Source text:\n{snippet}\n\nReturn up to {args.n} multiple-choice questions."
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    model, raw_payload, debug_or_text = try_chain(chain, messages, api_key, app_url)
    if not raw_payload:
        print(f"\nERROR: all models failed. last: {debug_or_text}", file=sys.stderr)
        sys.exit(3)

    if args.show_raw:
        print()
        print(LINE)
        print("RAW LLM JSON  (pre-polish)")
        print(LINE)
        print(json.dumps(raw_payload, indent=2, ensure_ascii=False))

    polished = polish_payload(raw_payload)
    if not polished:
        print(
            "\nERROR: every question rejected by polisher (fewer than 4 distinct "
            "options or unresolvable correctAnswer). Try a different model.",
            file=sys.stderr,
        )
        sys.exit(4)

    print_questions(polished, model)

    print("\n[done]")


if __name__ == "__main__":
    main()
