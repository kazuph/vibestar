import type { Config } from "drizzle-kit";

export default {
  schema: "./app/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    // For drizzle-kit migrations: Use local SQLite file directly
    url: "./local.db",
  },
} satisfies Config;
