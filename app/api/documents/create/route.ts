import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const { name, fileType, sizeBytes, userId } = await req.json();

    if (!name || !fileType) {
      return NextResponse.json({ error: "Missing name or fileType" }, { status: 400 });
    }

    const documentId = await convex.mutation(api.documents.createDocument, {
      name,
      fileType,
      sizeBytes,
      userId: userId ?? "n8n-ingestion",
    });

    return NextResponse.json({ documentId });
  } catch (err) {
    console.error("Create document error:", err);
    return NextResponse.json({ error: "Failed to create document" }, { status: 500 });
  }
}