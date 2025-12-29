import { Hono } from "hono";
import { eq, desc, and } from "drizzle-orm";
import type { Env } from "../load-context";
import { createAuth, type AuthEnv } from "../../app/lib/auth.server";
import { createDb } from "../../app/lib/db/client";
import {
  document,
  documentChunk,
  project,
  type NewDocument,
  type NewDocumentChunk,
  type NewProject,
} from "../../app/lib/db/schema";
import {
  processDocument,
  deleteDocumentVectors,
} from "../../app/lib/ai.server";

const documents = new Hono<{ Bindings: Env }>();

// GET /api/documents - List user's documents (optionally filtered by projectId)
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
  const projectId = c.req.query("projectId");

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

  // Build where conditions
  const conditions = [eq(document.userId, userId)];
  if (projectId) {
    conditions.push(eq(document.projectId, projectId));
  }

  // List documents (filtered by projectId if provided)
  const docs = await db
    .select({
      id: document.id,
      projectId: document.projectId,
      title: document.title,
      mimeType: document.mimeType,
      status: document.status,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    })
    .from(document)
    .where(and(...conditions))
    .orderBy(desc(document.createdAt));

  return c.json({ documents: docs });
});

// POST /api/documents - Upload a new document for RAG
// Requires projectId (will use default project if not specified)
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
  let projectId: string | undefined;

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return c.json({ error: "File is required" }, 400);
    }

    title = formData.get("title")?.toString() || file.name;
    content = await file.text();
    mimeType = file.type || "text/plain";
    projectId = formData.get("projectId")?.toString();
  } else {
    let body: { title: string; content: string; mimeType?: string; projectId?: string };

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
    projectId = body.projectId;
  }

  const db = createDb(env);

  // If no projectId, get or create default project
  if (!projectId) {
    const defaultProject = await db
      .select()
      .from(project)
      .where(and(eq(project.userId, userId), eq(project.isDefault, true)))
      .limit(1);

    if (defaultProject.length > 0) {
      projectId = defaultProject[0].id;
    } else {
      // Create default project
      const newDefaultProject: NewProject = {
        id: crypto.randomUUID(),
        userId,
        name: "Uncategorized",
        description: "Default project for documents without a project",
        isDefault: true,
      };
      await db.insert(project).values(newDefaultProject);
      projectId = newDefaultProject.id;
    }
  } else {
    // Verify project exists and belongs to user
    const existingProject = await db
      .select()
      .from(project)
      .where(and(eq(project.id, projectId), eq(project.userId, userId)))
      .limit(1);

    if (existingProject.length === 0) {
      return c.json({ error: "Project not found" }, 404);
    }
  }

  const newDocument: NewDocument = {
    id: crypto.randomUUID(),
    userId,
    projectId,
    title,
    content,
    mimeType,
    status: "processing",
  };

  await db.insert(document).values(newDocument);

  // Process document in background using waitUntil
  const docProjectId = projectId; // Capture for closure
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const { chunkIds, vectorIds } = await processDocument(
          env,
          newDocument.id,
          content,
          docProjectId
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
      projectId: docProjectId,
      status: "processing",
      message: "Document uploaded and processing started",
    },
    201
  );
});

// POST /api/documents/reindex - Reindex a document (delete vectors and re-process)
// This is useful after metadata index creation
documents.post("/reindex", async (c) => {
  const env = c.env;

  // Verify authentication
  const auth = createAuth(env as AuthEnv, c.req.raw);
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionData?.session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = sessionData.session.userId;

  let body: { documentId: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!body.documentId) {
    return c.json({ error: "documentId is required" }, 400);
  }

  const db = createDb(env);

  // Get document
  const doc = await db
    .select()
    .from(document)
    .where(eq(document.id, body.documentId))
    .limit(1);

  if (doc.length === 0) {
    return c.json({ error: "Document not found" }, 404);
  }

  if (doc[0].userId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Get existing chunks to find vector IDs
  const chunks = await db
    .select()
    .from(documentChunk)
    .where(eq(documentChunk.documentId, body.documentId));

  const vectorIds = chunks
    .map((chunk) => chunk.vectorId)
    .filter((id): id is string => id !== null);

  // Delete existing vectors
  if (vectorIds.length > 0) {
    try {
      await deleteDocumentVectors(c.env.VECTOR_INDEX, vectorIds);
      console.log(`Deleted ${vectorIds.length} vectors for document ${body.documentId}`);
    } catch (error) {
      console.error("Failed to delete vectors:", error);
    }
  }

  // Delete existing chunks
  await db.delete(documentChunk).where(eq(documentChunk.documentId, body.documentId));

  // Update status to processing
  await db
    .update(document)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(document.id, body.documentId));

  // Re-process document
  const docProjectId = doc[0].projectId;
  const content = doc[0].content;

  c.executionCtx.waitUntil(
    (async () => {
      try {
        const { chunkIds, vectorIds: newVectorIds } = await processDocument(
          env,
          doc[0].id,
          content,
          docProjectId
        );

        const newChunks: NewDocumentChunk[] = chunkIds.map((chunkId, index) => ({
          id: chunkId,
          documentId: doc[0].id,
          chunkIndex: index,
          content: content.slice(
            index * 450,
            Math.min((index + 1) * 500, content.length)
          ),
          vectorId: newVectorIds[index],
        }));

        if (newChunks.length > 0) {
          await db.insert(documentChunk).values(newChunks);
        }

        await db
          .update(document)
          .set({ status: "ready", updatedAt: new Date() })
          .where(eq(document.id, doc[0].id));

        console.log(`Document ${doc[0].id} reindexed successfully`);
      } catch (error) {
        console.error(`Document reindexing failed:`, error);

        await db
          .update(document)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(document.id, doc[0].id));
      }
    })()
  );

  return c.json({
    documentId: body.documentId,
    status: "reindexing",
    message: "Document reindexing started",
  });
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
