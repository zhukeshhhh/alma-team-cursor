/**
 * Recursive-style text splitting (chunkSize / chunkOverlap) without LangChain.
 * Prefers breaks at paragraph, line, then word boundaries before hard cuts.
 */
export function splitTextRecursive(
  text: string,
  chunkSize: number,
  chunkOverlap: number
): string[] {
  if (chunkOverlap >= chunkSize) {
    throw new Error("chunkOverlap must be less than chunkSize");
  }
  const normalized = text.replace(/\r\n/g, "\n");
  const chunks: string[] = [];
  let i = 0;

  while (i < normalized.length) {
    let end = Math.min(i + chunkSize, normalized.length);
    if (end < normalized.length) {
      const slice = normalized.slice(i, end);
      const para = slice.lastIndexOf("\n\n");
      const line = slice.lastIndexOf("\n");
      const space = slice.lastIndexOf(" ");
      const minBreak = Math.floor(chunkSize * 0.5);
      if (para >= minBreak) end = i + para + 2;
      else if (line >= minBreak) end = i + line + 1;
      else if (space >= minBreak) end = i + space + 1;
    }

    const chunk = normalized.slice(i, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= normalized.length) break;

    const nextStart = end - chunkOverlap;
    i = nextStart > i ? nextStart : end;
  }

  return chunks;
}
