import { Hono } from "hono";
import { createRequestHandler, type ServerBuild } from "react-router";
// @ts-ignore - This file is created by running npm run build
import * as build from "../build/server";
import { getLoadContext, type Env } from "./load-context";

// API routes
import health from "./api/health";
import auth from "./api/auth";
import chat from "./api/chat";
import documents from "./api/documents";
import projects from "./api/projects";

const app = new Hono<{ Bindings: Env }>();

// ============================================
// Global error handler for API routes
// ============================================
app.onError((err, c) => {
  console.error("API Error:", err);
  return c.json(
    { error: err.message || "Internal Server Error" },
    500
  );
});

// ============================================
// API Routes - mounted before React Router
// ============================================
app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/chat", chat);
app.route("/api/documents", documents);
app.route("/api/projects", projects);

// ============================================
// React Router handler - catches all other routes
// ============================================
app.all("*", async (c) => {
  const requestHandler = createRequestHandler(build as unknown as ServerBuild);

  const loadContext = getLoadContext({
    request: c.req.raw,
    context: {
      cloudflare: {
        cf: c.req.raw.cf as unknown as IncomingRequestCfProperties,
        ctx: {
          waitUntil: c.executionCtx.waitUntil.bind(c.executionCtx),
          passThroughOnException:
            c.executionCtx.passThroughOnException.bind(c.executionCtx),
          props: (c.executionCtx as any).props,
        },
        caches,
        env: c.env,
      },
    },
  });

  try {
    return await requestHandler(c.req.raw, loadContext);
  } catch (error) {
    console.error("React Router error:", error);
    return c.json({ error: "An unexpected error occurred" }, 500);
  }
});

export default app;
