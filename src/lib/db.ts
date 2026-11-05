import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;
const g = globalThis as unknown as { __fgdb?: DB };

export function openDb(file = process.env.DATABASE_FILE ?? "./data/fonectaguard.db"): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db;
}

export function getDb(): DB {
  return (g.__fgdb ??= openDb());
}
export { schema };
