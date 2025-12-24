import { Hono } from "hono";
import type { Env } from "../load-context";
import { createAuth, type AuthEnv } from "../../app/lib/auth.server";

const auth = new Hono<{ Bindings: Env }>();

// Better Auth handler - handles all /api/auth/* requests
auth.all("/*", async (c) => {
  const env = c.env as AuthEnv;
  const authInstance = createAuth(env, c.req.raw);
  return authInstance.handler(c.req.raw);
});

export default auth;
