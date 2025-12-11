import { eq, desc } from "drizzle-orm";
import type { Route } from "./+types/api.documents";
import { createAuth } from "~/lib/auth.server";
import { createDb } from "~/lib/db/client";
import {
  document,
  documentChunk,
  type NewDocument,
  type NewDocumentChunk,
} from "~/lib/db/schema";
import {
  processDocument,
  deleteDocumentVectors,
} from "~/lib/ai.server";
import type { Env } from "../../server/load-context";

/**
 * POST /api/documents
 * Upload a new document for RAG
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
  const contentType = request.headers.get("Content-Type") || "";

  // Handle DELETE method via _method override
  const url = new URL(request.url);
  const method = url.searchParams.get("_method")?.toUpperCase() || request.method;

  if (method === "DELETE") {
    return handleDelete(request, env, userId, url);
  }

  // Parse request - support both JSON and multipart/form-data
  let title: string;
  let content: string;
  let mimeType: string;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "File is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    title = formData.get("title")?.toString() || file.name;
    content = await file.text();
    mimeType = file.type || "text/plain";
  } else {
    // JSON body
    let body: { title: string; content: string; mimeType?: string };

    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!body.title || !body.content) {
      return new Response(
        JSON.stringify({ error: "Title and content are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    title = body.title;
    content = body.content;
    mimeType = body.mimeType || "text/plain";
  }

  const db = createDb(env);

  // Create document record
  const newDocument: NewDocument = {
    id: crypto.randomUUID(),
    userId,
    title,
    content,
    mimeType,
    status: "processing",
  };

  await db.insert(document).values(newDocument);

  // Check if AI binding is available (not available in local dev without remote bindings)
  const isLocalDev = !env.AI || typeof env.AI.run !== "function";

  // Process document in background using waitUntil
  context.cloudflare.ctx.waitUntil(
    (async () => {
      try {
        if (isLocalDev) {
          // Local development mode: skip vectorization, just mark as ready
          console.log(
            `[Local Dev] Skipping vectorization for document ${newDocument.id}`
          );

          // Create a dummy chunk record for the document
          const dummyChunk: NewDocumentChunk = {
            id: crypto.randomUUID(),
            documentId: newDocument.id,
            chunkIndex: 0,
            content: content.slice(0, 500),
            vectorId: null,
          };
          await db.insert(documentChunk).values(dummyChunk);

          // Update document status to ready
          await db
            .update(document)
            .set({ status: "ready", updatedAt: new Date() })
            .where(eq(document.id, newDocument.id));

          console.log(
            `[Local Dev] Document ${newDocument.id} marked as ready (no vectorization)`
          );
          return;
        }

        const { chunkIds, vectorIds } = await processDocument(
          env,
          newDocument.id,
          content
        );

        // Save chunk records
        const chunks: NewDocumentChunk[] = chunkIds.map((chunkId, index) => ({
          id: chunkId,
          documentId: newDocument.id,
          chunkIndex: index,
          content: content.slice(
            index * 450, // Account for overlap
            Math.min((index + 1) * 500, content.length)
          ),
          vectorId: vectorIds[index],
        }));

        if (chunks.length > 0) {
          await db.insert(documentChunk).values(chunks);
        }

        // Update document status
        await db
          .update(document)
          .set({ status: "ready", updatedAt: new Date() })
          .where(eq(document.id, newDocument.id));

        console.log(`Document ${newDocument.id} processed successfully`);
      } catch (error) {
        console.error(`Document processing failed:`, error);

        // Update document status to failed
        await db
          .update(document)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(document.id, newDocument.id));
      }
    })()
  );

  return new Response(
    JSON.stringify({
      id: newDocument.id,
      status: "processing",
      message: "Document uploaded and processing started",
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Handle DELETE request
 */
async function handleDelete(
  request: Request,
  env: Env,
  userId: string,
  url: URL
): Promise<Response> {
  const documentId = url.searchParams.get("id");

  if (!documentId) {
    return new Response(JSON.stringify({ error: "Document ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env);

  // Verify document belongs to user
  const doc = await db
    .select()
    .from(document)
    .where(eq(document.id, documentId))
    .limit(1);

  if (doc.length === 0) {
    return new Response(JSON.stringify({ error: "Document not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (doc[0].userId !== userId) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get chunk vector IDs before deletion
  const chunks = await db
    .select()
    .from(documentChunk)
    .where(eq(documentChunk.documentId, documentId));

  const vectorIds = chunks
    .map((c) => c.vectorId)
    .filter((id): id is string => id !== null);

  // Delete vectors from Vectorize
  if (vectorIds.length > 0) {
    try {
      await deleteDocumentVectors(env.VECTOR_INDEX, vectorIds);
    } catch (error) {
      console.error("Failed to delete vectors:", error);
      // Continue with DB deletion even if vector deletion fails
    }
  }

  // Delete document (cascades to chunks)
  await db.delete(document).where(eq(document.id, documentId));

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /api/documents
 * List user's documents
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
  const documentId = url.searchParams.get("id");

  const db = createDb(env);

  if (documentId) {
    // Get specific document
    const doc = await db
      .select()
      .from(document)
      .where(eq(document.id, documentId))
      .limit(1);

    if (doc.length === 0 || doc[0].userId !== userId) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ document: doc[0] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // List all documents
  const documents = await db
    .select({
      id: document.id,
      title: document.title,
      mimeType: document.mimeType,
      status: document.status,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    })
    .from(document)
    .where(eq(document.userId, userId))
    .orderBy(desc(document.createdAt));

  return new Response(JSON.stringify({ documents }), {
    headers: { "Content-Type": "application/json" },
  });
}
