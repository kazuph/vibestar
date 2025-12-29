import type { Config } from "drizzle-kit";

// Use Turso in production (CI/CD), local SQLite for development
const isProduction = process.env.TURSO_DATABASE_URL !== undefined;

export default {
  schema: "./app/lib/db/schema.ts",
  out: "./drizzle",
  dialect: isProduction ? "turso" : "sqlite",
  dbCredentials: isProduction
    ? {
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }
    : {
        url: "./local.db",
      },
} satisfies Config;
