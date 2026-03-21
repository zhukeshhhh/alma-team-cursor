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

export const storeChunksWithVectors = mutation({
  args: {
    documentId: v.id("documents"),
    chunks: v.array(
      v.object({
        chunkText: v.string(),
        chunkIndex: v.number(),
        vector: v.array(v.float64()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("embeddings")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const chunk of existing) {
      await ctx.db.delete(chunk._id);
    }

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
