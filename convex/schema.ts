import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    name: v.string(),
    uploadedAt: v.number(),
    status: v.union(
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error")
    ),
    userId: v.string(),
    fileType: v.string(),
    sizeBytes: v.optional(v.number()),
  }),

  chats: defineTable({
    documentId: v.id("documents"),
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
        timestamp: v.number(),
      })
    ),
  }),

  embeddings: defineTable({
    documentId: v.id("documents"),
    chunkText: v.string(),
    chunkIndex: v.number(),
    vector: v.optional(v.array(v.float64())),
  }),
});
    fileType: v.string(),
    sizeBytes: v.number(),
    userId: v.string(),
    status: v.union(v.literal("processing"), v.literal("ready")),
  }).index("by_user", ["userId"]),
});
