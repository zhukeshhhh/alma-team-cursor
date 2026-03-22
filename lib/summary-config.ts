/** Defaults tuned for faster summaries (shorter context + capped output). */

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Max characters of chunk text sent to the model (smaller = faster). */
export function getDefaultMaxSourceChars(): number {
  return parsePositiveInt(process.env.SUMMARY_MAX_SOURCE_CHARS, 16_000);
}

/** Max tokens the model may generate (`num_predict` in Ollama). */
export function getDefaultMaxTokens(): number {
  return clamp(parsePositiveInt(process.env.SUMMARY_MAX_TOKENS, 512), 64, 4096);
}

/** Abort Ollama request after this many ms (avoids hanging n8n forever). */
export function getDefaultTimeoutMs(): number {
  return clamp(parsePositiveInt(process.env.SUMMARY_TIMEOUT_MS, 120_000), 5_000, 600_000);
}

export function resolveSummaryLimits(overrides?: {
  maxSourceChars?: number;
  maxTokens?: number;
  timeoutMs?: number;
}) {
  const maxSourceChars = clamp(
    overrides?.maxSourceChars ?? getDefaultMaxSourceChars(),
    2_000,
    200_000
  );
  const maxTokens = clamp(
    overrides?.maxTokens ?? getDefaultMaxTokens(),
    64,
    4096
  );
  const timeoutMs = clamp(
    overrides?.timeoutMs ?? getDefaultTimeoutMs(),
    5_000,
    600_000
  );
  return { maxSourceChars, maxTokens, timeoutMs };
}
