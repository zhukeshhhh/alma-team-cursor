# Phase 3 — Chat & RAG
**Goal:** User sends a message → find relevant chunks → call Ollama on remote machine → stream response back → store conversation in Convex

**Models used:**
- `llama3-chatqa:8b` — main LLM (purpose-built for RAG and Q&A)
- `nomic-embed-text` — embeddings for semantic search

**Ollama endpoint:** `http://100.92.119.114:11434`

---

## What this phase delivers

By the end of this phase:
1. Every document chunk gets an embedding vector stored in Convex
2. When a user asks a question, the top 5 most relevant chunks are retrieved
3. Those chunks are injected into a system prompt
4. `llama3-chatqa:8b` generates an answer, streamed back to the UI
5. The full conversation is saved in Convex per document

---

## Step 1 — Add Ollama URL to environment variables

Add this to `.env.local`:

```
OLLAMA_BASE_URL=http://100.92.119.114:11434
```

---

## Step 2 — Install dependencies

```bash
npm install @langchain/ollama @langchain/community ai
```

- `@langchain/ollama` — LangChain integration for Ollama
- `ai` — Vercel AI SDK for streaming responses to the browser

---

## Step 3 — Create the embedding utility

This file handles generating embedding vectors using `nomic-embed-text`. It is called during ingestion and during chat.

Create `lib/embeddings.ts`:

```typescript
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL!;

export async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "nomic-embed-text",
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
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

---

## Step 4 — Update the ingestion pipeline to generate embeddings

Update `app/api/ingest/route.ts` — add embedding generation after chunks are stored. Replace the section after `splitter.splitText(text)` with this:

```typescript
import { getEmbedding } from "@/lib/embeddings";

// After splitting text into chunks, generate embeddings for each
const chunksWithVectors = await Promise.all(
  chunks.map(async (chunkText, chunkIndex) => ({
    chunkText,
    chunkIndex,
    vector: await getEmbedding(chunkText),
  }))
);

// Store chunks with vectors in Convex
await convex.mutation(api.embeddings.storeChunksWithVectors, {
  documentId,
  chunks: chunksWithVectors,
});
```

---

## Step 5 — Update convex/embeddings.ts to store vectors

Add this new mutation to `convex/embeddings.ts`:

```typescript
export const storeChunksWithVectors = mutation({
  args: {
    documentId: v.id("documents"),
    chunks: v.array(v.object({
      chunkText: v.string(),
      chunkIndex: v.number(),
      vector: v.array(v.float64()),
    })),
  },
  handler: async (ctx, args) => {
    // Delete existing chunks for this document
    const existing = await ctx.db
      .query("embeddings")
      .filter((q) => q.eq(q.field("documentId"), args.documentId))
      .collect();
    for (const chunk of existing) {
      await ctx.db.delete(chunk._id);
    }

    // Insert new chunks with vectors
    for (const chunk of args.chunks) {
      await ctx.db.insert("embeddings", {
        documentId: args.documentId,
        chunkText: chunk.chunkText,
        chunkIndex: chunk.chunkIndex,
        vector: chunk.vector,
      });
    }
  },
});
```

---

## Step 6 — Create the chat API route

This is the core of Phase 3. It retrieves relevant chunks by cosine similarity and streams the LLM response back.

Create `app/api/chat/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getEmbedding, cosineSimilarity } from "@/lib/embeddings";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL!;
const TOP_K = 5;

export async function POST(req: NextRequest) {
  try {
    const { message, documentId, chatId } = await req.json();

    if (!message || !documentId) {
      return NextResponse.json({ error: "Missing message or documentId" }, { status: 400 });
    }

    // 1. Embed the user's question
    const queryVector = await getEmbedding(message);

    // 2. Get all chunks for this document
    const allChunks = await convex.query(api.embeddings.getChunksByDocument, {
      documentId: documentId as Id<"documents">,
    });

    // 3. Score chunks by cosine similarity and take top K
    const scored = allChunks
      .filter((c) => c.vector && c.vector.length > 0)
      .map((chunk) => ({
        ...chunk,
        score: cosineSimilarity(queryVector, chunk.vector!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    if (scored.length === 0) {
      return NextResponse.json({ error: "No chunks found for this document" }, { status: 404 });
    }

    // 4. Build context from top chunks
    const context = scored
      .map((c, i) => `[Section ${i + 1}]\n${c.chunkText}`)
      .join("\n\n");

    // 5. Save user message to Convex
    let activeChatId = chatId;
    if (!activeChatId) {
      activeChatId = await convex.mutation(api.chats.createChat, {
        documentId: documentId as Id<"documents">,
      });
    }
    await convex.mutation(api.chats.appendMessage, {
      chatId: activeChatId as Id<"chats">,
      role: "user",
      content: message,
    });

    // 6. Call Ollama with streaming
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
            content: message,
          },
        ],
      }),
    });

    if (!ollamaResponse.ok || !ollamaResponse.body) {
      throw new Error(`Ollama request failed: ${ollamaResponse.statusText}`);
    }

    // 7. Stream response back to client and collect full text
    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        const reader = ollamaResponse.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const lines = decoder.decode(value).split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              const token = json.message?.content ?? "";
              fullResponse += token;
              controller.enqueue(encoder.encode(token));
            } catch {
              // skip malformed lines
            }
          }
        }

        // 8. Save assistant response to Convex after streaming completes
        await convex.mutation(api.chats.appendMessage, {
          chatId: activeChatId as Id<"chats">,
          role: "assistant",
          content: fullResponse,
        });

        // Send the chatId so the client can store it for continuity
        controller.enqueue(encoder.encode(`\n__CHAT_ID__:${activeChatId}`));
        controller.close();
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
```

---

## Step 7 — Add the chat UI to app/page.tsx

Add this chat state and message handler to your existing page component:

```typescript
"use client";
import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

// Add these to your existing state
const [selectedDocId, setSelectedDocId] = useState<Id<"documents"> | null>(null);
const [chatId, setChatId] = useState<string | null>(null);
const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
const [input, setInput] = useState("");
const [streaming, setStreaming] = useState(false);

const sendMessage = async () => {
  if (!input.trim() || !selectedDocId || streaming) return;

  const userMessage = input.trim();
  setInput("");
  setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
  setStreaming(true);

  // Add empty assistant message to stream into
  setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        documentId: selectedDocId,
        chatId,
      }),
    });

    if (!res.ok || !res.body) throw new Error("Chat request failed");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);

      // Extract chatId if present
      if (chunk.includes("__CHAT_ID__:")) {
        const id = chunk.split("__CHAT_ID__:")[1].trim();
        setChatId(id);
        continue;
      }

      // Stream tokens into the last message
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: updated[updated.length - 1].content + chunk,
        };
        return updated;
      });
    }
  } catch (err) {
    console.error("Chat error:", err);
  } finally {
    setStreaming(false);
  }
};

// Reset chat when switching documents
const selectDocument = (docId: Id<"documents">) => {
  setSelectedDocId(docId);
  setChatId(null);
  setMessages([]);
};
```

Add the chat UI below the document list:

```tsx
{/* Chat area — only shown when a document is selected */}
{selectedDocId && (
  <div>
    {/* Message list */}
    <div>
      {messages.map((msg, i) => (
        <div key={i} style={{ textAlign: msg.role === "user" ? "right" : "left" }}>
          <span>{msg.content}</span>
        </div>
      ))}
      {streaming && <span>Thinking...</span>}
    </div>

    {/* Input bar */}
    <div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        placeholder="Ask anything about this document..."
        disabled={streaming}
      />
      <button onClick={sendMessage} disabled={streaming || !input.trim()}>
        Send
      </button>
    </div>
  </div>
)}
```

---

## Step 8 — Test the full RAG pipeline

Make sure both servers are running:
- Terminal 1: `npx convex dev` (on laptop)
- Terminal 2: `npm run dev` (on laptop)
- Remote machine: `OLLAMA_HOST=0.0.0.0:11434 ollama serve`

Then test step by step:

**Test 1 — Embedding generation works:**
```bash
curl -X POST http://100.92.119.114:11434/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "nomic-embed-text", "prompt": "test document"}'
```
Should return a JSON object with an `embedding` array of 768 numbers.

**Test 2 — Upload a document and confirm vectors are stored:**
1. Upload a PDF through the UI
2. Open Convex dashboard → **Tables → embeddings**
3. Check that rows now have `vector` filled in (not empty)
   - A typical chunk will have an array of 768 float values

**Test 3 — Send a chat message:**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is this document about?",
    "documentId": "<paste a ready document ID from Convex>"
  }'
```
Should stream back a response from `llama3-chatqa:8b` citing sections from the document.

**Test 4 — Full UI flow:**
1. Upload a document, wait for status dot to turn green
2. Click the document to select it
3. Type a question and press Enter
4. Watch the response stream in token by token
5. Open Convex dashboard → **Tables → chats** — should show the full conversation stored

---

## Completion checklist

| Deliverable | Check |
|---|---|
| `nomic-embed-text` generates vectors for all chunks | ✓ |
| Embeddings table has `vector` column filled for all chunks | ✓ |
| `/api/chat` retrieves top 5 chunks by cosine similarity | ✓ |
| Response streams token by token to the browser | ✓ |
| Conversation is saved in Convex `chats` table | ✓ |
| Chat resets correctly when switching documents | ✓ |
| Model cites sections in its answers | ✓ |

Commit when done:
```bash
git add . && git commit -m "phase-3: RAG chat with Ollama"
git push
```

---

## Common errors & fixes

| Error | Fix |
|---|---|
| `fetch failed` on `/api/chat` | Check `OLLAMA_BASE_URL` in `.env.local`, restart `npm run dev` |
| `vector` column empty after upload | Check the Next.js terminal for embedding errors during ingestion |
| Response is empty or cuts off | The model may have run out of context — reduce `TOP_K` from 5 to 3 |
| `llama3-chatqa:8b` not found | Run `ollama pull llama3-chatqa:8b` on the remote machine |
| Slow first response | Normal — the model loads into VRAM on first request, subsequent ones are fast |
| Chat not persisting between page refreshes | Expected for now — add `useEffect` to load existing chat from Convex on mount |
