import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { vi } from "vitest";
import * as schema from "~/lib/schema";

/**
 * Mock ~/lib/db.server with a fresh in-memory SQLite DB.
 * Call this at the top of test files that use queries.server.ts.
 * Each vi.mock call creates one shared DB for the module.
 */
export function mockDb() {
  vi.mock("~/lib/db.server", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "migrations" });
    return { db };
  });
}
