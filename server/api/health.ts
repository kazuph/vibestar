import { Hono } from "hono";
import type { Env } from "../load-context";

const health = new Hono<{ Bindings: Env }>();

// Health check endpoint with AI binding diagnostics
health.get("/", (c) => {
  const env = c.env;

  // Check AI binding status
  const aiBinding = env.AI;
  const aiStatus = {
    exists: !!aiBinding,
    hasRunMethod: !!(aiBinding && typeof (aiBinding as any).run === "function"),
  };

  // Check Vectorize binding status
  const vectorBinding = env.VECTOR_INDEX;
  const vectorStatus = {
    exists: !!vectorBinding,
    hasQueryMethod: !!(
      vectorBinding && typeof (vectorBinding as any).query === "function"
    ),
  };

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    bindings: {
      ai: aiStatus,
      vectorize: vectorStatus,
    },
  });
});

export default health;
