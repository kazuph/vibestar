import type { PlatformProxy } from "wrangler";

export interface Env {
  // Cloudflare bindings
  VALUE_FROM_CLOUDFLARE: string;

  // Database
  DATABASE_URL?: string;
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;

  // Auth
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;

  // Email
  RESEND_API_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;

  // AI bindings
  AI: Ai;
  VECTOR_INDEX: VectorizeIndex;
}

type CloudflareContext = Omit<PlatformProxy<Env>, "dispose" | "caches"> & {
  caches:
    | PlatformProxy<Env, IncomingRequestCfProperties>["caches"]
    | CacheStorage;
};

type GetLoadContextArgs = {
  request: Request;
  context: {
    cloudflare: CloudflareContext;
  };
};

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: CloudflareContext;
  }
}

export const getLoadContext = ({ context }: GetLoadContextArgs) => {
  return context;
};
