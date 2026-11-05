import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/lib/schema";
import type { DB } from "@/lib/db";

/** In-memory sqlite standing in for D1; the engine only awaits results, so both drivers work. */
export function openTestDb(): DB {
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as DB;
}
