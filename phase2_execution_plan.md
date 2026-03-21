# Phase 2 — Document Pipeline
**Goal:** Upload a real PDF → extract text → split into chunks → store in Convex → confirm retrieval works

---

## What this phase delivers

By the end of this phase, dropping a PDF into the UI should:
1. Store the file metadata in Convex (`documents` table)
2. Extract its text content server-side
3. Split the text into overlapping chunks
4. Store those chunks in Convex (`embeddings` table — text only, vectors come in Phase 3)
5. Update the document status from `uploading` → `processing` → `ready`

No LLM calls yet. No embeddings yet. Just reliable text extraction and chunking.

---

## Step 1 — Install dependencies

```bash
npm install langchain @langchain/community pdf-parse mammoth
npm install -D @types/pdf-parse
```

- `pdf-parse` — extracts text from PDFs
- `mammoth` — extracts text from DOCX files
- `langchain` — provides the `RecursiveCharacterTextSplitter`

---

## Step 2 — Create the ingestion API route

Create `app/api/ingest/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const documentId = formData.get("documentId") as Id<"documents">;

    if (!file || !documentId) {
      return NextResponse.json({ error: "Missing file or documentId" }, { status: 400 });
    }

    // Mark as processing
    await convex.mutation(api.documents.updateDocumentStatus, {
      id: documentId,
      status: "processing",
    });

    // Extract text based on file type
    const text = await extractText(file);

    if (!text || text.trim().length === 0) {
      await convex.mutation(api.documents.updateDocumentStatus, {
        id: documentId,
        status: "error",
      });
      return NextResponse.json({ error: "Could not extract text from file" }, { status: 422 });
    }

    // Split into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });
    const chunks = await splitter.splitText(text);

    // Store chunks in Convex
    await convex.mutation(api.embeddings.storeChunks, {
      documentId,
      chunks,
    });

    // Mark as ready
    await convex.mutation(api.documents.updateDocumentStatus, {
      id: documentId,
      status: "ready",
    });

    return NextResponse.json({
      success: true,
      chunkCount: chunks.length,
      charCount: text.length,
    });

  } catch (err) {
    console.error("Ingestion error:", err);
    return NextResponse.json({ error: "Ingestion failed" }, { status: 500 });
  }
}

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = file.type;

  if (type === "application/pdf" || file.name.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (type === "text/plain" || file.name.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  throw new Error(`Unsupported file type: ${type}`);
}
```

---

## Step 3 — Confirm convex/embeddings.ts is complete

You already have `convex/embeddings.ts` from Phase 1. Confirm it contains both `storeChunks` and `getChunksByDocument`. If not, make sure it matches this exactly:

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const storeChunks = mutation({
  args: {
    documentId: v.id("documents"),
    chunks: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Delete any existing chunks for this document (re-upload case)
    const existing = await ctx.db
      .query("embeddings")
      .filter((q) => q.eq(q.field("documentId"), args.documentId))
      .collect();
    for (const chunk of existing) {
      await ctx.db.delete(chunk._id);
    }

    // Insert new chunks
    for (let i = 0; i < args.chunks.length; i++) {
      await ctx.db.insert("embeddings", {
        documentId: args.documentId,
        chunkText: args.chunks[i],
        chunkIndex: i,
      });
    }
  },
});

export const getChunksByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("embeddings")
      .filter((q) => q.eq(q.field("documentId"), args.documentId))
      .order("asc")
      .collect();
  },
});
```

---

## Step 4 — Wire the upload button to the ingestion endpoint

In your main page component `app/page.tsx`, replace any placeholder upload logic with this:

```typescript
"use client";
import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const createDocument = useMutation(api.documents.createDocument);
  const documents = useQuery(api.documents.listDocuments, { userId: "demo-user" }) ?? [];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // 1. Create the document record in Convex
      const documentId = await createDocument({
        name: file.name,
        fileType: file.type,
        sizeBytes: file.size,
        userId: "demo-user",
      });

      // 2. Send file to ingestion endpoint
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentId", documentId);

      const res = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("Ingestion failed:", err);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {/* Upload button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? "Processing..." : "Upload Document"}
      </button>

      {/* Document list with live status */}
      {documents.map((doc) => (
        <div key={doc._id}>
          <span>{doc.name}</span>
          <StatusDot status={doc.status} />
        </div>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors = {
    uploading:  "bg-gray-400",
    processing: "bg-yellow-400 animate-pulse",
    ready:      "bg-green-500",
    error:      "bg-red-500",
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status as keyof typeof colors] ?? "bg-gray-300"}`} />
  );
}
```

---

## Step 5 — Add pdf-parse to Next.js server externals

Edit `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
```

---

## Step 6 — Test the full pipeline

Make sure `npx convex dev` is running in one terminal and `npm run dev` in another. Then:

1. Click **Upload Document** in the UI and pick any PDF from your machine
2. Watch the status dot: gray → yellow (pulsing) → green
3. Open `http://127.0.0.1:6790` → **Tables → documents**: status column should show `ready`
4. Open **Tables → embeddings**: should show multiple rows with `chunkText` filled in and `vector` empty

To test via curl directly (get a real document ID from the Convex dashboard first):

```bash
curl -X POST http://localhost:3000/api/ingest \
  -F "file=@/path/to/your/test.pdf" \
  -F "documentId=<paste document ID here>"
```

Expected response:
```json
{ "success": true, "chunkCount": 47, "charCount": 23810 }
```

---

## Completion checklist

| Deliverable | Check |
|---|---|
| Upload button accepts PDF, DOCX, TXT | ✓ |
| Status dot animates through all 4 states | ✓ |
| `/api/ingest` extracts text from PDF and DOCX | ✓ |
| Chunks appear in `embeddings` table | ✓ |
| Re-uploading same doc replaces old chunks | ✓ |
| `next.config.ts` has `serverExternalPackages` | ✓ |

Commit when all boxes are checked:
```bash
git add . && git commit -m "phase-2: document ingestion pipeline"
git push
```

---

## Common errors & fixes

| Error | Fix |
|---|---|
| `Cannot find module 'pdf-parse'` | Run `npm install pdf-parse`, restart `npm run dev` |
| `ENOENT: no such file or directory, open '.../test.pdf'` | Add `serverExternalPackages: ["pdf-parse"]` to `next.config.ts` |
| Status stays on `processing` forever | Check the Next.js terminal for a runtime error in `/api/ingest` |
| Convex mutation error: "Unknown function" | Make sure `npx convex dev` is running and picked up `embeddings.ts` |
| `chunkText` shows garbled text | The PDF is image-based (scanned). Use a text-based PDF for demos |
| `mammoth` not found | Run `npm install mammoth` |
