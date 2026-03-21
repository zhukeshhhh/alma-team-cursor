import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const storeChunks = mutation({
  args: {
    documentId: v.id("documents"),
    chunks: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("embeddings")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const chunk of existing) {
      await ctx.db.delete(chunk._id);
    }
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
    const rows = await ctx.db
      .query("embeddings")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
    return rows.sort((a, b) => a.chunkIndex - b.chunkIndex);
  },
});
