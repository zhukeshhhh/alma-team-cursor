import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const runtime = "nodejs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

/**
 * GET /api/documents/:id/status
 *
 * Returns document metadata including pipeline `status` (uploading | processing | ready | error).
 * Use from n8n HTTP Request: URL = .../api/documents/{{ $json.documentId }}/status
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!convex) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_CONVEX_URL is not configured" },
        { status: 500 }
      );
    }

    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Missing document id" }, { status: 400 });
    }

    const doc = await convex.query(api.documents.getDocument, {
      id: id as Id<"documents">,
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: doc._id,
      name: doc.name,
      status: doc.status,
      uploadedAt: doc.uploadedAt,
      fileType: doc.fileType,
      sizeBytes: doc.sizeBytes,
      userId: doc.userId,
    });
  } catch (err) {
    console.error("Document status error:", err);
    return NextResponse.json(
      { error: "Failed to load document status" },
      { status: 500 }
    );
  }
}
