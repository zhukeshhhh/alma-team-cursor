import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    name: v.string(),
    fileType: v.string(),
    sizeBytes: v.number(),
    userId: v.string(),
    status: v.union(v.literal("processing"), v.literal("ready")),
  }).index("by_user", ["userId"]),
});
