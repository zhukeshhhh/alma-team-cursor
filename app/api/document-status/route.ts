import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const runtime = "nodejs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

/**
 * GET /api/document-status?documentId=<convex documents id>
 *
 * Same payload as GET /api/documents/:id/status — easier in n8n when you only
 * want to set query parameters (no path templating).
 */
export async function GET(req: NextRequest) {
  try {
    if (!convex) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_CONVEX_URL is not configured" },
        { status: 500 }
      );
    }

    const documentId = req.nextUrl.searchParams.get("documentId")?.trim();
    if (!documentId) {
      return NextResponse.json(
        { error: "Missing documentId query parameter" },
        { status: 400 }
      );
    }

    const doc = await convex.query(api.documents.getDocument, {
      id: documentId as Id<"documents">,
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
