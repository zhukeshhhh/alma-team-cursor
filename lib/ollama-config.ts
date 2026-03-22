/**
 * Ollama settings for **text generation** (`/api/chat`, `/api/summarize`).
 *
 * Embeddings (vectors for RAG) are separate — see `lib/embeddings.ts` and
 * `OLLAMA_EMBEDDING_MODEL` (default `nomic-embed-text`).
 */

export function getOllamaBaseUrl(): string {
  const raw = process.env.OLLAMA_BASE_URL?.trim();
  if (!raw) return "";
  return raw.replace(/\/$/, "");
}

/** Model for `/api/chat` and `/api/summarize` (Ollama `POST /api/chat`). */
export function getOllamaTextModel(): string {
  return (
    process.env.OLLAMA_TEXT_MODEL?.trim() ||
    process.env.OLLAMA_CHAT_MODEL?.trim() ||
    "qwen3.5:9b"
  );
}
