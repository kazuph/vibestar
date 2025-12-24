import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import type { Env } from "../load-context";
import { createAuth, type AuthEnv } from "../../app/lib/auth.server";
import { createDb } from "../../app/lib/db/client";
import {
  document,
  documentChunk,
  type NewDocument,
  type NewDocumentChunk,
} from "../../app/lib/db/schema";
import {
  processDocument,
  deleteDocumentVectors,
} from "../../app/lib/ai.server";

const documents = new Hono<{ Bindings: Env }>();

// GET /api/documents - List user's documents
documents.get("/", async (c) => {
  const env = c.env;

  // Verify authentication
  const auth = createAuth(env as AuthEnv, c.req.raw);
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionData?.session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = sessionData.session.userId;
  const documentId = c.req.query("id");

  const db = createDb(env);

  if (documentId) {
    const doc = await db
      .select()
      .from(document)
      .where(eq(document.id, documentId))
      .limit(1);

    if (doc.length === 0 || doc[0].userId !== userId) {
      return c.json({ error: "Document not found" }, 404);
    }

    return c.json({ document: doc[0] });
  }

  // List all documents
  const docs = await db
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

  return c.json({ documents: docs });
});

// POST /api/documents - Upload a new document for RAG
documents.post("/", async (c) => {
  const env = c.env;

  // Verify authentication
  const auth = createAuth(env as AuthEnv, c.req.raw);
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionData?.session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = sessionData.session.userId;
  const contentType = c.req.header("Content-Type") || "";

  let title: string;
  let content: string;
  let mimeType: string;

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return c.json({ error: "File is required" }, 400);
    }

    title = formData.get("title")?.toString() || file.name;
    content = await file.text();
    mimeType = file.type || "text/plain";
  } else {
    let body: { title: string; content: string; mimeType?: string };

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    if (!body.title || !body.content) {
      return c.json({ error: "Title and content are required" }, 400);
    }

    title = body.title;
    content = body.content;
    mimeType = body.mimeType || "text/plain";
  }

  const db = createDb(env);

  const newDocument: NewDocument = {
    id: crypto.randomUUID(),
    userId,
    title,
    content,
    mimeType,
    status: "processing",
  };

  await db.insert(document).values(newDocument);

  // Process document in background using waitUntil
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const { chunkIds, vectorIds } = await processDocument(
          env,
          newDocument.id,
          content
        );

        const chunks: NewDocumentChunk[] = chunkIds.map((chunkId, index) => ({
          id: chunkId,
          documentId: newDocument.id,
          chunkIndex: index,
          content: content.slice(
            index * 450,
            Math.min((index + 1) * 500, content.length)
          ),
          vectorId: vectorIds[index],
        }));

        if (chunks.length > 0) {
          await db.insert(documentChunk).values(chunks);
        }

        await db
          .update(document)
          .set({ status: "ready", updatedAt: new Date() })
          .where(eq(document.id, newDocument.id));

        console.log(`Document ${newDocument.id} processed successfully`);
      } catch (error) {
        console.error(`Document processing failed:`, error);

        await db
          .update(document)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(document.id, newDocument.id));
      }
    })()
  );

  return c.json(
    {
      id: newDocument.id,
      status: "processing",
      message: "Document uploaded and processing started",
    },
    201
  );
});

// DELETE /api/documents - Delete a document
documents.delete("/", async (c) => {
  const env = c.env;

  // Verify authentication
  const auth = createAuth(env as AuthEnv, c.req.raw);
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionData?.session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = sessionData.session.userId;
  const documentId = c.req.query("id");

  if (!documentId) {
    return c.json({ error: "Document ID is required" }, 400);
  }

  const db = createDb(env);

  const doc = await db
    .select()
    .from(document)
    .where(eq(document.id, documentId))
    .limit(1);

  if (doc.length === 0) {
    return c.json({ error: "Document not found" }, 404);
  }

  if (doc[0].userId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const chunks = await db
    .select()
    .from(documentChunk)
    .where(eq(documentChunk.documentId, documentId));

  const vectorIds = chunks
    .map((chunk) => chunk.vectorId)
    .filter((id): id is string => id !== null);

  if (vectorIds.length > 0) {
    try {
      await deleteDocumentVectors(c.env.VECTOR_INDEX, vectorIds);
    } catch (error) {
      console.error("Failed to delete vectors:", error);
    }
  }

  await db.delete(document).where(eq(document.id, documentId));

  return c.json({ success: true });
});

export default documents;
