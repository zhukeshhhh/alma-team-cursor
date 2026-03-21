import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getEmbedding, cosineSimilarity } from "@/lib/embeddings";

export const runtime = "nodejs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL;
const TOP_K = 5;

export async function POST(req: NextRequest) {
  try {
    if (!convex) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_CONVEX_URL is not configured" },
        { status: 500 }
      );
    }
    if (!OLLAMA_BASE_URL) {
      return NextResponse.json(
        { error: "OLLAMA_BASE_URL is not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { message, documentId, chatId } = body as {
      message?: string;
      documentId?: string;
      chatId?: string | null;
    };

    if (!message?.trim() || !documentId) {
      return NextResponse.json(
        { error: "Missing message or documentId" },
        { status: 400 }
      );
    }

    const docId = documentId as Id<"documents">;

    const queryVector = await getEmbedding(message);

    const allChunks = await convex.query(api.embeddings.getChunksByDocument, {
      documentId: docId,
    });

    const scored = allChunks
      .filter((c) => c.vector && c.vector.length > 0)
      .map((chunk) => ({
        ...chunk,
        score: cosineSimilarity(queryVector, chunk.vector!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    if (scored.length === 0) {
      return NextResponse.json(
        { error: "No embedded chunks found for this document. Re-upload after embeddings are enabled." },
        { status: 404 }
      );
    }

    const context = scored
      .map((c, i) => `[Section ${i + 1}]\n${c.chunkText}`)
      .join("\n\n");

    let activeChatId: Id<"chats">;
    if (chatId) {
      activeChatId = chatId as Id<"chats">;
    } else {
      activeChatId = await convex.mutation(api.chats.createChat, {
        documentId: docId,
      });
    }

    await convex.mutation(api.chats.appendMessage, {
      chatId: activeChatId,
      role: "user",
      content: message.trim(),
    });

    const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3-chatqa:8b",
        stream: true,
        messages: [
          {
            role: "system",
            content: `You are a government document analyst. Answer questions using ONLY the context sections provided below. If you are uncertain about a numerical value, say so explicitly. Always cite which section your answer comes from (e.g. "According to Section 2..."). Do not make up information.

Context:
${context}`,
          },
          {
            role: "user",
            content: message.trim(),
          },
        ],
      }),
    });

    if (!ollamaResponse.ok || !ollamaResponse.body) {
      return NextResponse.json(
        { error: `Ollama request failed: ${ollamaResponse.statusText}` },
        { status: 502 }
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = "";
        try {
          const reader = ollamaResponse.body!.getReader();
          const decoder = new TextDecoder();
          let lineBuffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            lineBuffer += decoder.decode(value, { stream: true });
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const json = JSON.parse(line) as {
                  message?: { content?: string };
                };
                const token = json.message?.content ?? "";
                if (token) {
                  fullResponse += token;
                  controller.enqueue(encoder.encode(token));
                }
              } catch {
                // skip malformed NDJSON lines
              }
            }
          }

          if (lineBuffer.trim()) {
            try {
              const json = JSON.parse(lineBuffer) as {
                message?: { content?: string };
              };
              const token = json.message?.content ?? "";
              if (token) {
                fullResponse += token;
                controller.enqueue(encoder.encode(token));
              }
            } catch {
              // ignore trailing garbage
            }
          }

          await convex.mutation(api.chats.appendMessage, {
            chatId: activeChatId,
            role: "assistant",
            content: fullResponse,
          });

          controller.close();
        } catch (err) {
          console.error("Chat stream error:", err);
          try {
            controller.error(err);
          } catch {
            // already closed
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Chat-Id": activeChatId,
      },
    });
  } catch (err) {
    console.error("Chat error:", err);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}
