import type { Route } from "./+types/api.health";

export async function loader({ context }: Route.LoaderArgs) {
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: context.cloudflare.env.VALUE_FROM_CLOUDFLARE,
  });
}
