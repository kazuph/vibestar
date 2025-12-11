import { Hono } from "hono";
import { createRequestHandler, type ServerBuild } from "react-router";
// @ts-ignore - This file is created by running npm run build
import * as build from "../build/server";
import { getLoadContext, type Env } from "./load-context";

const app = new Hono<{ Bindings: Env }>();

// Global middleware can be added here
// Example: app.use("*", cors());
// Example: app.use("*", basicAuth({ ... }));

// Health check endpoint
app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Example API routes can be added here
// app.get("/api/users", async (c) => {
//   return c.json({ users: [] });
// });

// React Router handler - catches all other routes
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
