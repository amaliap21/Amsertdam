// Strip non-teaching front matter from extracted document text BEFORE it is
// chunked and sent to the model (or to the deterministic fallback).
//
// Why this exists: reports and papers begin with a cover page (title, author /
// group names, student ids, lecturer, institution), a table of contents, and
// lists of figures and tables. pdf-parse glues all of that into the first few
// thousand characters, so the first chunk the model sees is pure navigation.
// The model then "correctly" makes questions about lecturers, page counts, and
// which chapter discusses what, which is useless for studying. Removing this
// scaffolding means the model only sees substantive content.

/** A window looks like real prose (body), not a heading or a TOC line. */
function looksLikeProse(s: string): boolean {
  if (/\.{3,}/.test(s)) return false; // dotted leaders => table of contents
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length < 18) return false;
  const lower = (s.match(/[a-z]/g) ?? []).length;
  const upper = (s.match(/[A-Z]/g) ?? []).length;
  // Body prose is lowercase-heavy; cover/TOC/headings are uppercase-heavy.
  return lower > upper * 2;
}

/**
 * Remove cover/table-of-contents front matter, a trailing references list, page
 * headers/footers, dotted-leader navigation, and cover ids. Falls back to the
 * original text if the result would be too short to be usable.
 */
export function cleanSourceText(raw: string): string {
  if (!raw) return raw;
  let t = raw;

  // 1. Drop a trailing references / bibliography section (everything after the
  // LAST such heading), but only when it sits in the back half so a stray
  // mention earlier in the body doesn't truncate real content.
  {
    const re = /\b(?:references|daftar\s+pustaka|bibliography|works\s+cited)\b/gi;
    let idx = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) idx = m.index;
    if (idx > t.length * 0.5) t = t.slice(0, idx);
  }

  // 2. Cut the front matter: slice from the FIRST content heading that is
  // actually followed by prose. A table-of-contents entry like
  // "BAB I PENDAHULUAN ........ 5" is followed by dotted leaders, not prose, so
  // it is skipped, and we land on the real chapter body instead.
  const headingRe =
    /\b(?:ABSTRAK|ABSTRACT|PENDAHULUAN|INTRODUCTION|LATAR\s+BELAKANG|BAB\s+[IVXLC]+\b|CHAPTER\s+\d+\b|BAGIAN\s+\d+\b)/gi;
  let cut = -1;
  let mh: RegExpExecArray | null;
  while ((mh = headingRe.exec(t)) !== null) {
    const start = mh.index + mh[0].length;
    if (looksLikeProse(t.slice(start, start + 260))) {
      cut = mh.index;
      break;
    }
  }
  if (cut > 0) t = t.slice(cut);

  // 3. Remove dotted-leader TOC / figure / table entries and their page numbers.
  t = t.replace(/\.{3,}\s*\d*/g, " ");

  // 4. Remove running headers / footers and page markers.
  t = t
    .replace(/-{2,}\s*\d+\s*(?:of|dari|\/)\s*\d+\s*-{2,}/gi, " ")
    .replace(/\bhalaman\s+\d+\s+dari\s+\d+\s+halaman\b/gi, " ")
    .replace(/\bpage\s+\d+\s+of\s+\d+\b/gi, " ")
    // standalone student / member id numbers on a cover, e.g. "(10821025)"
    .replace(/\(\s*\d{6,}\s*\)/g, " ");

  // 5. Collapse the whitespace the removals left behind.
  t = t
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Never hand back near-empty text (e.g. an aggressive cut on an odd layout):
  // fall back to the original so generation still has something to work with.
  return t.length >= 200 ? t : raw;
}
