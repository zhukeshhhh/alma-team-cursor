import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Create a new document record (called when user uploads a file)
export const createDocument = mutation({
  args: {
    name: v.string(),
    fileType: v.string(),
    sizeBytes: v.optional(v.number()),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      name: args.name,
      fileType: args.fileType,
      sizeBytes: args.sizeBytes,
      userId: args.userId,
      uploadedAt: Date.now(),
      status: "uploading",
    });
  },
});

// Update document status (called by ingestion pipeline)
export const updateDocumentStatus = mutation({
  args: {
    id: v.id("documents"),
    status: v.union(
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status });
  },
});

// List all documents for a user
export const listDocuments = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});