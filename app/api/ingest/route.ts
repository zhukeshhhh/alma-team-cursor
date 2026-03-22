export const runtime = "nodejs";

import { createRequire } from "node:module";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getEmbedding } from "@/lib/embeddings";
import { splitTextRecursive } from "@/lib/text-splitter";

const requirePdf = createRequire(import.meta.url);
const pdfParse = requirePdf("pdf-parse/lib/pdf-parse.js") as (
  data: Buffer
) => Promise<{ text: string }>;

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function POST(req: NextRequest) {
  let documentId: Id<"documents"> | null = null;

  try {
    if (!convex) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_CONVEX_URL is not configured" },
        { status: 500 }
      );
    }

    // --- Parse request --- supports both browser (multipart) and n8n (base64 JSON)
    let buffer: Buffer;
    let fileName: string;
    let fileType: string;
    let rawId: string;

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      // n8n sends base64-encoded file content as JSON
      const body = await req.json();

      if (!body.fileContent || !body.fileName || !body.documentId) {
        return NextResponse.json(
          { error: "Missing fileContent, fileName, or documentId in JSON body" },
          { status: 400 }
        );
      }

      rawId = body.documentId;
      fileName = body.fileName;
      fileType = body.fileType ?? "";
      buffer = Buffer.from(body.fileContent, "base64");
    } else {
      // Browser sends multipart/form-data
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const formId = formData.get("documentId");

      if (!file || typeof formId !== "string" || formId.length === 0) {
        return NextResponse.json(
          { error: "Missing file or documentId in form data" },
          { status: 400 }
        );
      }

      rawId = formId;
      fileName = file.name;
      fileType = file.type;
      buffer = Buffer.from(await file.arrayBuffer());
    }

    documentId = rawId as Id<"documents">;

    // --- Mark as processing ---
    await convex.mutation(api.documents.updateDocumentStatus, {
      id: documentId,
      status: "processing",
    });

    // --- Extract text ---
    const text = await extractTextFromBuffer(buffer, fileName, fileType);

    if (!text || text.trim().length === 0) {
      await convex.mutation(api.documents.updateDocumentStatus, {
        id: documentId,
        status: "error",
      });
      return NextResponse.json(
        { error: "Could not extract text from file" },
        { status: 422 }
      );
    }

    // --- Chunk and embed ---
    const chunks = splitTextRecursive(text, 500, 50);

    const chunksWithVectors = await Promise.all(
      chunks.map(async (chunkText, chunkIndex) => ({
        chunkText,
        chunkIndex,
        vector: await getEmbedding(chunkText),
      }))
    );

    // --- Store in Convex ---
    await convex.mutation(api.embeddings.storeChunksWithVectors, {
      documentId,
      chunks: chunksWithVectors,
    });

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
    if (convex && documentId) {
      try {
        await convex.mutation(api.documents.updateDocumentStatus, {
          id: documentId,
          status: "error",
        });
      } catch (patchErr) {
        console.error("Failed to mark document error:", patchErr);
      }
    }
    return NextResponse.json({ error: "Ingestion failed" }, { status: 500 });
  }
}

async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string,
  fileType: string
): Promise<string> {
  const nameLower = fileName.toLowerCase();

  if (fileType === "application/pdf" || nameLower.endsWith(".pdf")) {
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (
    fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    nameLower.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (fileType === "text/plain" || nameLower.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  throw new Error(`Unsupported file type: ${fileType || fileName}`);
}