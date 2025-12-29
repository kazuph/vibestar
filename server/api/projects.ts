import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import type { Env } from "../load-context";
import { createAuth, type AuthEnv } from "../../app/lib/auth.server";
import { createDb } from "../../app/lib/db/client";
import {
  project,
  document,
  type NewProject,
} from "../../app/lib/db/schema";

const projects = new Hono<{ Bindings: Env }>();

// GET /api/projects - List user's projects
projects.get("/", async (c) => {
  const env = c.env;

  // Verify authentication
  const auth = createAuth(env as AuthEnv, c.req.raw);
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionData?.session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = sessionData.session.userId;
  const db = createDb(env);

  const userProjects = await db
    .select({
      id: project.id,
      name: project.name,
      description: project.description,
      isDefault: project.isDefault,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .where(eq(project.userId, userId))
    .orderBy(desc(project.isDefault), desc(project.createdAt));

  return c.json({ projects: userProjects });
});

// POST /api/projects - Create a new project
projects.post("/", async (c) => {
  const env = c.env;

  // Verify authentication
  const auth = createAuth(env as AuthEnv, c.req.raw);
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionData?.session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = sessionData.session.userId;

  let body: { name: string; description?: string };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!body.name || typeof body.name !== "string") {
    return c.json({ error: "Name is required" }, 400);
  }

  const db = createDb(env);

  const newProject: NewProject = {
    id: crypto.randomUUID(),
    userId,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    isDefault: false,
  };

  await db.insert(project).values(newProject);

  return c.json(
    {
      id: newProject.id,
      name: newProject.name,
      description: newProject.description,
      isDefault: newProject.isDefault,
      message: "Project created successfully",
    },
    201
  );
});

// PUT /api/projects - Update a project
projects.put("/", async (c) => {
  const env = c.env;

  // Verify authentication
  const auth = createAuth(env as AuthEnv, c.req.raw);
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionData?.session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = sessionData.session.userId;
  const projectId = c.req.query("id");

  if (!projectId) {
    return c.json({ error: "Project ID is required" }, 400);
  }

  let body: { name?: string; description?: string };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const db = createDb(env);

  // Check if project exists and belongs to user
  const existingProject = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);

  if (existingProject.length === 0) {
    return c.json({ error: "Project not found" }, 404);
  }

  const updates: Partial<NewProject> = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) {
    updates.name = body.name.trim();
  }
  if (body.description !== undefined) {
    updates.description = body.description.trim() || null;
  }

  await db
    .update(project)
    .set(updates)
    .where(eq(project.id, projectId));

  return c.json({ success: true, message: "Project updated successfully" });
});

// DELETE /api/projects - Delete a project
projects.delete("/", async (c) => {
  const env = c.env;

  // Verify authentication
  const auth = createAuth(env as AuthEnv, c.req.raw);
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionData?.session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = sessionData.session.userId;
  const projectId = c.req.query("id");

  if (!projectId) {
    return c.json({ error: "Project ID is required" }, 400);
  }

  const db = createDb(env);

  // Check if project exists and belongs to user
  const existingProject = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);

  if (existingProject.length === 0) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Prevent deletion of default project
  if (existingProject[0].isDefault) {
    return c.json({ error: "Cannot delete the default project" }, 400);
  }

  // Get or create default project to move orphaned documents
  let defaultProject = await db
    .select()
    .from(project)
    .where(and(eq(project.userId, userId), eq(project.isDefault, true)))
    .limit(1);

  if (defaultProject.length === 0) {
    // Create default project
    const newDefaultProject: NewProject = {
      id: crypto.randomUUID(),
      userId,
      name: "Uncategorized",
      description: "Default project for documents without a project",
      isDefault: true,
    };
    await db.insert(project).values(newDefaultProject);
    defaultProject = [{
      id: newDefaultProject.id,
      userId: newDefaultProject.userId,
      name: newDefaultProject.name,
      description: newDefaultProject.description ?? null,
      isDefault: newDefaultProject.isDefault ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }];
  }

  // Move documents to default project
  await db
    .update(document)
    .set({ projectId: defaultProject[0].id, updatedAt: new Date() })
    .where(eq(document.projectId, projectId));

  // Delete the project
  await db.delete(project).where(eq(project.id, projectId));

  return c.json({ success: true, message: "Project deleted successfully" });
});

// POST /api/projects/ensure-default - Ensure default project exists for user
projects.post("/ensure-default", async (c) => {
  const env = c.env;

  // Verify authentication
  const auth = createAuth(env as AuthEnv, c.req.raw);
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionData?.session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = sessionData.session.userId;
  const db = createDb(env);

  // Check if default project exists
  const existingDefault = await db
    .select()
    .from(project)
    .where(and(eq(project.userId, userId), eq(project.isDefault, true)))
    .limit(1);

  if (existingDefault.length > 0) {
    return c.json({
      id: existingDefault[0].id,
      name: existingDefault[0].name,
      message: "Default project already exists",
    });
  }

  // Create default project
  const newDefaultProject: NewProject = {
    id: crypto.randomUUID(),
    userId,
    name: "Uncategorized",
    description: "Default project for documents without a project",
    isDefault: true,
  };

  await db.insert(project).values(newDefaultProject);

  // Move existing documents without projectId to default project
  await db
    .update(document)
    .set({ projectId: newDefaultProject.id, updatedAt: new Date() })
    .where(and(eq(document.userId, userId), eq(document.projectId, null as unknown as string)));

  return c.json(
    {
      id: newDefaultProject.id,
      name: newDefaultProject.name,
      message: "Default project created",
    },
    201
  );
});

export default projects;
