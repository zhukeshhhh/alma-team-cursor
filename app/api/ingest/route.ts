import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getEmbedding } from "@/lib/embeddings";
import { splitTextRecursive } from "@/lib/text-splitter";

export const runtime = "nodejs";

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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const rawId = formData.get("documentId");

    if (!file || typeof rawId !== "string" || rawId.length === 0) {
      return NextResponse.json(
        { error: "Missing file or documentId" },
        { status: 400 }
      );
    }

    documentId = rawId as Id<"documents">;

    await convex.mutation(api.documents.updateDocumentStatus, {
      id: documentId,
      status: "processing",
    });

    const text = await extractText(file);

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

    const chunks = splitTextRecursive(text, 500, 50);

    const chunksWithVectors = await Promise.all(
      chunks.map(async (chunkText, chunkIndex) => ({
        chunkText,
        chunkIndex,
        vector: await getEmbedding(chunkText),
      }))
    );

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

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = file.type;
  const nameLower = file.name.toLowerCase();

  if (type === "application/pdf" || nameLower.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    nameLower.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (type === "text/plain" || nameLower.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  throw new Error(`Unsupported file type: ${type || file.name}`);
}
