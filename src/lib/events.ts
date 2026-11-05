import { schema, type DB } from "./db";
import { newId, now } from "./ids";

export function emit(db: DB, orgId: string, locationId: string | null, scanRunId: string | null, eventType: string, message: string, metadata?: Record<string, unknown>) {
  db.insert(schema.agentEvents).values({ id: newId(), organizationId: orgId, locationId, scanRunId, eventType, message, metadataJson: metadata ?? null, createdAt: now() }).run();
}

export function audit(db: DB, orgId: string, userId: string | null, action: string, detail?: unknown) {
  db.insert(schema.auditLogs).values({ id: newId(), organizationId: orgId, userId, action, detailJson: detail ?? null, createdAt: now() }).run();
}

export function notify(db: DB, userId: string, type: string, dedupeKey: string, payload: Record<string, unknown>) {
  db.insert(schema.notifications).values({ id: newId(), userId, type, dedupeKey, payloadJson: payload, createdAt: now() }).onConflictDoNothing().run();
}
