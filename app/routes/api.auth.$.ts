import type { Route } from "./+types/api.auth.$";
import { createAuth, type AuthEnv } from "~/lib/auth.server";

/**
 * Better Auth API handler
 * Handles all /api/auth/* requests
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as AuthEnv;
  const auth = createAuth(env, request);
  return auth.handler(request);
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as AuthEnv;
  const auth = createAuth(env, request);
  return auth.handler(request);
}
