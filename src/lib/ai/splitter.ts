export function splitTextIntoChunks(text: string, maxChars = 4000, overlap = 200): string[] {
  if (!text) return [];
  // Split on sentence boundaries, keep punctuation
  const sentences = text.match(/[^.!?]+[.!?\n]*/g) || [text];
  const chunks: string[] = [];
  let current = "";
  for (const sent of sentences) {
    if ((current + sent).length <= maxChars) {
      current += sent;
      continue;
    }
    if (current.trim()) {
      chunks.push(current.trim());
    }
    // start new chunk; optionally include overlap from tail of previous chunk
    if (overlap > 0) {
      const tail = current.slice(-overlap);
      current = tail + sent;
    } else {
      current = sent;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
