import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import type { Env } from "../load-context";
import { createAuth, type AuthEnv } from "../../app/lib/auth.server";
import { createDb } from "../../app/lib/db/client";
import {
  conversation,
  message,
  type NewConversation,
  type NewMessage,
} from "../../app/lib/db/schema";
import {
  chatCompletionStream,
  performRagQuery,
  buildSystemPromptWithContext,
  type ChatMessage,
} from "../../app/lib/ai.server";

const chat = new Hono<{ Bindings: Env }>();

// GET /api/chat - Get messages for a conversation or list conversations
chat.get("/", async (c) => {
  const env = c.env;

  // Verify authentication
  const auth = createAuth(env as AuthEnv, c.req.raw);
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionData?.session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = sessionData.session.userId;
  const conversationId = c.req.query("conversationId");

  const db = createDb(env);

  if (conversationId) {
    // Get messages for specific conversation
    const conv = await db
      .select()
      .from(conversation)
      .where(eq(conversation.id, conversationId))
      .limit(1);

    if (conv.length === 0 || conv[0].userId !== userId) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    const messages = await db
      .select()
      .from(message)
      .where(eq(message.conversationId, conversationId))
      .orderBy(message.createdAt);

    return c.json({ conversation: conv[0], messages });
  }

  // Get all conversations for user
  const conversations = await db
    .select()
    .from(conversation)
    .where(eq(conversation.userId, userId))
    .orderBy(desc(conversation.updatedAt));

  return c.json({ conversations });
});

// POST /api/chat - Send a message and get streaming response
chat.post("/", async (c) => {
  const env = c.env;

  // Verify authentication
  const auth = createAuth(env as AuthEnv, c.req.raw);
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionData?.session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = sessionData.session.userId;

  // Parse request body
  let body: {
    message: string;
    conversationId?: string;
    useRag?: boolean;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!body.message || typeof body.message !== "string") {
    return c.json({ error: "Message is required" }, 400);
  }

  const db = createDb(env);

  // Get or create conversation
  let conversationId = body.conversationId;

  if (!conversationId) {
    const newConversation: NewConversation = {
      id: crypto.randomUUID(),
      userId,
      title: body.message.slice(0, 50),
    };

    await db.insert(conversation).values(newConversation);
    conversationId = newConversation.id;
  }

  // Get previous messages for context
  const previousMessages = await db
    .select()
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(desc(message.createdAt))
    .limit(10);

  // Build chat messages array
  const chatMessages: ChatMessage[] = previousMessages
    .reverse()
    .map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));

  chatMessages.push({ role: "user", content: body.message });

  // Save user message
  const userMessage: NewMessage = {
    id: crypto.randomUUID(),
    conversationId,
    role: "user",
    content: body.message,
  };
  await db.insert(message).values(userMessage);

  // Perform RAG if enabled
  let systemPrompt = "You are a helpful AI assistant.";

  if (body.useRag) {
    try {
      const contexts = await performRagQuery(env, body.message, 3);
      systemPrompt = buildSystemPromptWithContext(contexts);
    } catch (error) {
      console.error("RAG query failed:", error);
    }
  }

  // Stream response from Workers AI
  try {
    const stream = await chatCompletionStream(env.AI, chatMessages, systemPrompt);

    let fullResponse = "";
    const decoder = new TextDecoder();

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = decoder.decode(chunk);
        console.log("[DEBUG STREAM]:", JSON.stringify(text));
        fullResponse += text;
        controller.enqueue(chunk);
      },
      async flush() {
        const assistantMessage: NewMessage = {
          id: crypto.randomUUID(),
          conversationId: conversationId!,
          role: "assistant",
          content: fullResponse,
        };

        try {
          await db.insert(message).values(assistantMessage);
        } catch (error) {
          console.error("Failed to save assistant message:", error);
        }
      },
    });

    const responseStream = stream.pipeThrough(transformStream);

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Conversation-Id": conversationId,
      },
    });
  } catch (error) {
    console.error("Chat completion error:", error);
    return c.json({ error: "Failed to generate response" }, 500);
  }
});

export default chat;
