import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/**
 * Environment type for Cloudflare Workers
 */
export interface DbEnv {
  DATABASE_URL?: string;
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
}

/**
 * Creates a Drizzle database client
 *
 * For local development: Uses sqld via HTTP (DATABASE_URL=http://127.0.0.1:8080)
 *   - sqld is a local SQLite server that supports @libsql/client web build
 *   - Start with: docker compose up -d sqld
 *
 * For production: Uses Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN)
 *
 * Note: Cloudflare Workers dev environment uses Web APIs, so file: URLs
 * are not supported. Use sqld for local development instead.
 */
export function createDb(env: DbEnv) {
  // Production: Use Turso if credentials are provided
  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
    const client = createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });
    return drizzle(client, { schema });
  }

  // Local development: Use sqld via HTTP
  // Default to local sqld server (started via docker compose)
  const url = env.DATABASE_URL || "http://127.0.0.1:8080";
  const client = createClient({ url });
  return drizzle(client, { schema });
}

/**
 * Helper type for inferring the database schema
 */
export type DbSchema = typeof schema;
