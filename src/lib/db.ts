import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";
import { setSelfFetcher } from "./extract";

export type DB = DrizzleD1Database<typeof schema>;

export interface CfEnv {
  DB: D1Database;
  SCAN_QUEUE?: Queue<ScanJob>;
  WORKER_SELF_REFERENCE?: Fetcher;
}
/** Queue message. Each message runs in its own Worker invocation (own subrequest budget); AI audits fan out one job per assistant. */
export interface ScanJob { locationId: string; scanId: string; paceMs: number; trigger: string; kind?: "scan" | "ai_audit" | "public_sources" | "agent"; auditId?: string; assistantId?: string; payload?: Record<string, unknown> }

export function dbFromEnv(env: CfEnv): DB {
  if (env.WORKER_SELF_REFERENCE) setSelfFetcher(env.WORKER_SELF_REFERENCE);
  return drizzle(env.DB, { schema });
}

export async function getCfEnv(): Promise<CfEnv> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  return (await getCloudflareContext({ async: true })).env as unknown as CfEnv;
}

/** D1 handle for the current request. */
export async function getDb(): Promise<DB> {
  return dbFromEnv(await getCfEnv());
}

/** Returns the number of rows changed by a write (D1 and better-sqlite3 report it differently). */
export function changes(r: unknown): number {
  const x = r as { meta?: { changes?: number }; changes?: number };
  return x.meta?.changes ?? x.changes ?? 0;
}
export { schema };
