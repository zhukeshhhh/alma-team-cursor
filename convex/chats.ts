import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Create a new chat session for a document
export const createChat = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chats", {
      documentId: args.documentId,
      messages: [],
    });
  },
});

// Append a message to a chat
export const appendMessage = mutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");
    await ctx.db.patch(args.chatId, {
      messages: [
        ...chat.messages,
        { role: args.role, content: args.content, timestamp: Date.now() },
      ],
    });
  },
});

// Get chat by document
export const getChatByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chats")
      .filter((q) => q.eq(q.field("documentId"), args.documentId))
      .first();
  },
});