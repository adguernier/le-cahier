import type { Config } from "drizzle-kit";

export default {
  schema: "./app/lib/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_PATH ?? "data/household.db" },
} satisfies Config;
