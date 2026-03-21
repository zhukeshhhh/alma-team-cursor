import { v } from "convex/values";
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";

export const listDocuments = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

export const createDocument = mutation({
  args: {
    name: v.string(),
    fileType: v.string(),
    sizeBytes: v.number(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      name: args.name,
      fileType: args.fileType,
      sizeBytes: args.sizeBytes,
      userId: args.userId,
      status: "processing",
    });
  },
});
