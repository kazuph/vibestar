import type { Route } from "./+types/api.health";
import type { Env } from "../../server/load-context";

export async function loader({ context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;

  // Check AI binding status
  const aiBinding = env.AI;
  const aiStatus = {
    exists: !!aiBinding,
    hasRunMethod: !!(aiBinding && typeof aiBinding.run === "function"),
  };

  // Check Vectorize binding status
  const vectorBinding = env.VECTOR_INDEX;
  const vectorStatus = {
    exists: !!vectorBinding,
    hasQueryMethod: !!(vectorBinding && typeof vectorBinding.query === "function"),
  };

  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    bindings: {
      ai: aiStatus,
      vectorize: vectorStatus,
    },
  });
}
