import { describe, it, expect } from "vitest";
import { openTestDb } from "./helpers";
import { createWorkspace } from "./fixtures";
import { schema } from "@/lib/db";
import { deleteWorkspace } from "@/lib/workspace-delete";
import { newId, now } from "@/lib/ids";
import { encryptSecret } from "@/lib/crypto";

const TABLES = ["users", "organizations", "organizationMembers", "businessLocations", "canonicalFieldVersions", "connections", "listings", "listingObservations", "scanRuns", "discrepancies", "repairProposals", "repairAttempts", "agentEvents", "notifications", "healthSnapshots", "auditLogs", "aiAudits", "aiAuditAnswers"] as const;
const count = async (db: ReturnType<typeof openTestDb>) => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, (await db.select().from(schema[t] as never).all()).length])));

async function populate(db: ReturnType<typeof openTestDb>, ws: { userId: string; orgId: string; locId: string }) {
  const listingId = newId(), discId = newId(), propId = newId(), auditId = newId();
  await db.insert(schema.connections).values({ id: newId(), organizationId: ws.orgId, platform: "facebook", externalAccountId: "1", status: "connected", capabilitiesJson: ["read"], encryptedCredentialReference: await encryptSecret("tok"), expiresAt: null, lastSyncedAt: now() }).run();
  await db.insert(schema.listings).values({ id: listingId, locationId: ws.locId, platform: "web", url: `https://x.test/${listingId}`, identityConfidence: 1, discoveredAt: now() }).run();
  await db.insert(schema.listingObservations).values({ id: newId(), listingId, observedDataJson: {}, evidenceJson: {}, observedAt: now(), contentHash: "h" }).run();
  await db.insert(schema.discrepancies).values({ id: discId, locationId: ws.locId, listingId, fieldName: "phone", severity: "high", confidence: 0.8, explanation: "x", impact: "x", classification: "likely", status: "awaiting_approval", firstDetectedAt: now(), lastSeenAt: now() }).run();
  await db.insert(schema.repairProposals).values({ id: propId, discrepancyId: discId, targetPlatform: "web", proposedChangeJson: { field: "phone", oldValue: "a", newValue: "b", action: "x", capability: "x", risk: "low" }, evidenceJson: {}, confidence: 0.8, explanation: "x", status: "approved", createdAt: now() }).run();
  await db.insert(schema.repairAttempts).values({ id: newId(), proposalId: propId, idempotencyKey: newId(), status: "submitted", attemptedAt: now() }).run();
  await db.insert(schema.aiAudits).values({ id: auditId, locationId: ws.locId, status: "completed", startedAt: now() }).run();
  await db.insert(schema.aiAuditAnswers).values({ id: newId(), auditId, assistant: "a", model: "m", questionKey: "hours", prompt: "p", createdAt: now() }).run();
  await db.insert(schema.agentEvents).values({ id: newId(), organizationId: ws.orgId, eventType: "e", message: "m", createdAt: now() }).run();
  await db.insert(schema.auditLogs).values({ id: newId(), organizationId: ws.orgId, action: "a", createdAt: now() }).run();
  await db.insert(schema.notifications).values({ id: newId(), userId: ws.userId, type: "t", payloadJson: {}, createdAt: now() }).run();
  await db.insert(schema.healthSnapshots).values({ id: newId(), locationId: ws.locId, monitoredFields: 1, matchingFields: 1, score: 100, recordedAt: now() }).run();
  await db.insert(schema.scanRuns).values({ id: newId(), locationId: ws.locId, status: "completed", triggerType: "manual", startedAt: now() }).run();
}

describe("deleteWorkspace", () => {
  it("removes every trace of one workspace and leaves another workspace untouched", async () => {
    const db = openTestDb();
    const a = await createWorkspace(db), b = await createWorkspace(db);
    await populate(db, a); await populate(db, b);
    const before = await count(db);
    await deleteWorkspace(db, a.orgId, a.userId);
    const after = await count(db);
    for (const t of TABLES) expect(after[t], t).toBe(before[t] / 2);
    expect((await db.select().from(schema.users).all()).map((u) => u.id)).toEqual([b.userId]);
    await deleteWorkspace(db, b.orgId, b.userId);
    expect(Object.values(await count(db)).every((n) => n === 0)).toBe(true);
  });
});

import { makeSessionToken, verifySessionToken } from "@/lib/auth";
describe("private access link", () => {
  it("is a signed token for exactly one user: tampering or another secret does not open anything", () => {
    const t = makeSessionToken("user-1");
    expect(verifySessionToken(t)).toBe("user-1");
    expect(verifySessionToken(t.replace("user-1", "user-2"))).toBeNull();
    expect(verifySessionToken(t.slice(0, -2) + "00")).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
  });
});
