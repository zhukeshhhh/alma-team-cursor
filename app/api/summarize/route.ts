import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getOllamaBaseUrl, getOllamaTextModel } from "@/lib/ollama-config";
import { resolveSummaryLimits } from "@/lib/summary-config";

export const runtime = "nodejs";

/** Vercel / some hosts: allow long Ollama calls (must be ≤ your plan’s cap). */
export const maxDuration = 300;

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

/**
 * GET  /api/summarize?documentId=<id>&maxTokens=512&maxSourceChars=16000&timeoutMs=90000
 * POST /api/summarize  { "documentId": "<id>", "maxTokens"?, "maxSourceChars"?, "timeoutMs"? }
 *
 * GET is convenient for n8n and simple links; POST avoids putting ids in URLs.
 * Optional: SUMMARIZE_API_KEY + Authorization: Bearer … or X-Summarize-Key
 *
 * Speed: defaults use less input + `num_predict` cap (see `lib/summary-config.ts` + env SUMMARY_*).
 */

function checkSummarizeAuth(req: NextRequest): boolean {
  const key = process.env.SUMMARIZE_API_KEY?.trim();
  if (!key) return true;
  const auth = req.headers.get("authorization");
  const headerKey = req.headers.get("x-summarize-key");
  return auth === `Bearer ${key}` || headerKey === key;
}

function readNumericOverride(
  obj: Record<string, unknown> | undefined,
  key: string
): number | undefined {
  if (!obj) return undefined;
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function overridesFromRequest(
  req: NextRequest,
  body?: Record<string, unknown>
) {
  const sp = req.nextUrl.searchParams;
  const q = (k: string) => {
    const raw = sp.get(k);
    if (raw === null || raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  return resolveSummaryLimits({
    maxSourceChars:
      readNumericOverride(body, "maxSourceChars") ?? q("maxSourceChars"),
    maxTokens: readNumericOverride(body, "maxTokens") ?? q("maxTokens"),
    timeoutMs: readNumericOverride(body, "timeoutMs") ?? q("timeoutMs"),
  });
}

async function summarizeDocument(
  documentId: string,
  limits: ReturnType<typeof resolveSummaryLimits>
) {
  if (!convex) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_CONVEX_URL is not configured" },
      { status: 500 }
    );
  }
  const ollamaBase = getOllamaBaseUrl();
  if (!ollamaBase) {
    return NextResponse.json(
      { error: "OLLAMA_BASE_URL is not configured" },
      { status: 500 }
    );
  }
  const textModel = getOllamaTextModel();

  const docId = documentId as Id<"documents">;

  const doc = await convex.query(api.documents.getDocument, { id: docId });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const chunks = await convex.query(api.embeddings.getChunksByDocument, {
    documentId: docId,
  });

  if (chunks.length === 0) {
    return NextResponse.json(
      {
        error:
          "No chunks stored for this document. Ingest the document first.",
      },
      { status: 404 }
    );
  }

  const { maxSourceChars, maxTokens, timeoutMs } = limits;

  const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  let sourceText = ordered.map((c) => c.chunkText).join("\n\n");
  let truncated = false;
  if (sourceText.length > maxSourceChars) {
    sourceText =
      sourceText.slice(0, maxSourceChars) +
      "\n\n[Document truncated for summarization — only the beginning was sent to the model.]";
    truncated = true;
  }

  const options: Record<string, number> = {
    num_predict: maxTokens,
    temperature: 0.2,
    top_k: 20,
    top_p: 0.9,
  };
  const numCtxRaw = process.env.SUMMARY_NUM_CTX?.trim();
  if (numCtxRaw) {
    const n = Number.parseInt(numCtxRaw, 10);
    if (Number.isFinite(n) && n >= 512) {
      options.num_ctx = Math.min(n, 131072);
    }
  }

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${ollamaBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: textModel,
        stream: false,
        /** Qwen3: reasoning can eat `num_predict` and leave `content` empty — must be top-level, not in `options`. */
        think: false,
        options,
        messages: [
          {
            role: "system",
            content: `You write short email-ready summaries. Rules:
- Output ONLY the summary: plain text, no code fences, no <think> blocks, no "Let me think" or step-by-step reasoning.
- Start immediately with the first sentence.
- 3–8 short bullet lines for key facts, dates, obligations, risks. If unknown, say "Not stated in the excerpt."
- Do not invent facts.`,
          },
          {
            role: "user",
            content: `Summarize this document for an executive email.

Title: ${doc.name}

--- Document text ---

${sourceText}`,
          },
        ],
      }),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return NextResponse.json(
        {
          error: "Summary generation timed out",
          detail: `Ollama did not finish within ${timeoutMs}ms. Raise SUMMARY_TIMEOUT_MS or lower SUMMARY_MAX_TOKENS / SUMMARY_MAX_SOURCE_CHARS.`,
        },
        { status: 504 }
      );
    }
    throw err;
  }

  if (!ollamaRes.ok) {
    const errText = await ollamaRes.text();
    return NextResponse.json(
      {
        error: "Ollama request failed",
        detail: errText.slice(0, 500),
        status: ollamaRes.status,
      },
      { status: 502 }
    );
  }

  const data = (await ollamaRes.json()) as {
    message?: { content?: string; thinking?: string };
  };
  let summary = data.message?.content?.trim();
  if (!summary && data.message?.thinking?.trim()) {
    summary = data.message.thinking.trim();
  }
  if (!summary) {
    return NextResponse.json(
      {
        error: "Ollama returned an empty summary",
        detail:
          "If you use Qwen3, ensure Ollama supports top-level `think: false` for /api/chat. Try increasing SUMMARY_MAX_TOKENS or use a non-reasoning model tag.",
        raw: JSON.stringify(data).slice(0, 800),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    documentId: docId,
    documentName: doc.name,
    documentStatus: doc.status,
    summary,
    truncated,
    limits: {
      maxSourceChars,
      maxTokens,
      timeoutMs,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    if (!checkSummarizeAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const documentId = req.nextUrl.searchParams.get("documentId")?.trim();
    if (!documentId) {
      return NextResponse.json(
        { error: "Missing documentId query parameter" },
        { status: 400 }
      );
    }

    return summarizeDocument(documentId, overridesFromRequest(req));
  } catch (err) {
    console.error("Summarize GET error:", err);
    const message = err instanceof Error ? err.message : "Summarize failed";
    return NextResponse.json(
      { error: "Summarize failed", detail: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!checkSummarizeAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const documentId = body?.documentId as string | undefined;
    if (!documentId?.trim()) {
      return NextResponse.json(
        { error: "Missing documentId in JSON body" },
        { status: 400 }
      );
    }

    return summarizeDocument(
      documentId.trim(),
      overridesFromRequest(req, body)
    );
  } catch (err) {
    console.error("Summarize POST error:", err);
    const message = err instanceof Error ? err.message : "Summarize failed";
    return NextResponse.json(
      { error: "Summarize failed", detail: message },
      { status: 500 }
    );
  }
}
