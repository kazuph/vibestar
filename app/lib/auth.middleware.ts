import { redirect } from "react-router";
import { createAuth, type AuthEnv } from "./auth.server";

/**
 * Helper function to require authentication in a loader
 * Redirects to the sign-in page if not authenticated
 *
 * @example
 * export async function loader({ request, context }: Route.LoaderArgs) {
 *   const session = await requireAuth(request, context.cloudflare.env);
 *   // session.user is guaranteed to exist here
 *   return { user: session.user };
 * }
 */
export async function requireAuth(
  request: Request,
  env: AuthEnv,
  options?: {
    redirectTo?: string;
  }
) {
  const auth = createAuth(env, request);

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    const redirectTo = options?.redirectTo || "/auth/signin";
    throw redirect(redirectTo);
  }

  return session;
}

/**
 * Helper function to get the current session without requiring authentication
 * Returns null if not authenticated
 *
 * @example
 * export async function loader({ request, context }: Route.LoaderArgs) {
 *   const session = await getOptionalAuth(request, context.cloudflare.env);
 *   return { user: session?.user || null };
 * }
 */
export async function getOptionalAuth(request: Request, env: AuthEnv) {
  const auth = createAuth(env, request);

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return session;
}

/**
 * Helper function to require that the user is NOT authenticated
 * Redirects to the dashboard if already authenticated
 *
 * @example
 * export async function loader({ request, context }: Route.LoaderArgs) {
 *   await requireGuest(request, context.cloudflare.env);
 *   return {};
 * }
 */
export async function requireGuest(
  request: Request,
  env: AuthEnv,
  options?: {
    redirectTo?: string;
  }
) {
  const auth = createAuth(env, request);

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (session) {
    const redirectTo = options?.redirectTo || "/dashboard";
    throw redirect(redirectTo);
  }

  return null;
}
