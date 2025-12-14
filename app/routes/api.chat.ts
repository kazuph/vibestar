import { eq, desc } from "drizzle-orm";
import type { Route } from "./+types/api.chat";
import { createAuth } from "~/lib/auth.server";
import { createDb } from "~/lib/db/client";
import {
  conversation,
  message,
  type NewConversation,
  type NewMessage,
} from "~/lib/db/schema";
import {
  chatCompletionStream,
  performRagQuery,
  buildSystemPromptWithContext,
  type ChatMessage,
} from "~/lib/ai.server";
import type { Env } from "../../server/load-context";

/**
 * POST /api/chat
 * Streaming chat with optional RAG context
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;

  // Verify authentication
  const auth = createAuth(env, request);
  const sessionData = await auth.api.getSession({ headers: request.headers });

  if (!sessionData?.session?.userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = sessionData.session.userId;

  // Parse request body
  let body: {
    message: string;
    conversationId?: string;
    useRag?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.message || typeof body.message !== "string") {
    return new Response(JSON.stringify({ error: "Message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env);

  // Get or create conversation
  let conversationId = body.conversationId;

  if (!conversationId) {
    // Create new conversation
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

  // Add current message
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
      // Continue without RAG context
    }
  }

  // Stream response from Workers AI (remote binding enabled in wrangler.toml)
  try {
    const stream = await chatCompletionStream(env.AI, chatMessages, systemPrompt);

    // Create a transform stream to capture the full response
    let fullResponse = "";
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = decoder.decode(chunk);
        // DEBUG: Log raw stream data to understand the format
        console.log("[DEBUG STREAM]:", JSON.stringify(text));
        fullResponse += text;
        controller.enqueue(chunk);
      },
      async flush() {
        // Save assistant message after stream completes
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
    return new Response(
      JSON.stringify({ error: "Failed to generate response" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * GET /api/chat?conversationId=xxx
 * Get messages for a conversation
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;

  // Verify authentication
  const auth = createAuth(env, request);
  const sessionData = await auth.api.getSession({ headers: request.headers });

  if (!sessionData?.session?.userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = sessionData.session.userId;
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");

  const db = createDb(env);

  if (conversationId) {
    // Get messages for specific conversation
    // First verify the conversation belongs to the user
    const conv = await db
      .select()
      .from(conversation)
      .where(eq(conversation.id, conversationId))
      .limit(1);

    if (conv.length === 0 || conv[0].userId !== userId) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const messages = await db
      .select()
      .from(message)
      .where(eq(message.conversationId, conversationId))
      .orderBy(message.createdAt);

    return new Response(
      JSON.stringify({ conversation: conv[0], messages }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Get all conversations for user
  const conversations = await db
    .select()
    .from(conversation)
    .where(eq(conversation.userId, userId))
    .orderBy(desc(conversation.updatedAt));

  return new Response(JSON.stringify({ conversations }), {
    headers: { "Content-Type": "application/json" },
  });
}
