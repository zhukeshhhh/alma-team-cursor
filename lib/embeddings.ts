import { getOllamaBaseUrl } from "@/lib/ollama-config";

/** Embedding model for `/api/embeddings` — not used for chat/summary text. */
const EMBEDDING_MODEL =
  process.env.OLLAMA_EMBEDDING_MODEL?.trim() || "nomic-embed-text";

export async function getEmbedding(text: string): Promise<number[]> {
  const base = getOllamaBaseUrl();
  if (!base) {
    throw new Error("OLLAMA_BASE_URL is not set");
  }

  const response = await fetch(`${base}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}