import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { schema, type DB } from "./db";
import { newId, now } from "./ids";
import { canWrite } from "./auth-roles";
import { compareField, FIELD_LABELS, isMatch, type FieldName } from "./compare";
import { audit, emit, notify } from "./events";
import { connectorInfo, getConnector } from "./connectors";
import { listingLabel, observeListing, recheckListing, snapshotHealth } from "./scan";
import { displayValue } from "./format";

export class RepairError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Proposal = typeof schema.repairProposals.$inferSelect;

function load(db: DB, id: string, orgId: string) {
  const p = db.select().from(schema.repairProposals).where(eq(schema.repairProposals.id, id)).get();
  if (!p) throw new RepairError(404, "Proposal not found");
  const d = db.select().from(schema.discrepancies).where(eq(schema.discrepancies.id, p.discrepancyId)).get()!;
  const loc = db.select().from(schema.businessLocations).where(eq(schema.businessLocations.id, d.locationId)).get()!;
  if (loc.organizationId !== orgId) throw new RepairError(404, "Proposal not found"); // no cross-tenant leakage
  const listing = db.select().from(schema.listings).where(eq(schema.listings.id, d.listingId)).get()!;
  return { p, d, loc, listing };
}

function setStatus(db: DB, p: Proposal, status: string, discStatus = status) {
  db.update(schema.repairProposals).set({ status }).where(eq(schema.repairProposals.id, p.id)).run();
  db.update(schema.discrepancies).set({ status: discStatus, lastSeenAt: now() }).where(eq(schema.discrepancies.id, p.discrepancyId)).run();
}

export function editProposal(db: DB, a: { proposalId: string; orgId: string; userId: string; role: string; newValue: string }) {
  if (!canWrite(a.role)) throw new RepairError(403, "Insufficient permissions");
  const { p, d, loc } = load(db, a.proposalId, a.orgId);
  if (p.status !== "awaiting_approval") throw new RepairError(409, `Cannot edit a proposal in status ${p.status}`);
  const v = a.newValue.trim();
  if (!v || v.length > 500) throw new RepairError(400, "Invalid value");
  db.update(schema.repairProposals).set({ proposedChangeJson: { ...p.proposedChangeJson, newValue: v } }).where(eq(schema.repairProposals.id, p.id)).run();
  audit(db, loc.organizationId, a.userId, "repair.edited", { proposalId: p.id, from: p.proposedChangeJson.newValue, to: v });
  emit(db, loc.organizationId, loc.id, null, "proposal_edited", `Proposed ${FIELD_LABELS[d.fieldName as FieldName].toLowerCase()} edited by owner: "${v}".`, { proposalId: p.id });
}

export function rejectProposal(db: DB, a: { proposalId: string; orgId: string; userId: string; role: string; reason?: string }) {
  if (!canWrite(a.role)) throw new RepairError(403, "Insufficient permissions");
  const { p, loc } = load(db, a.proposalId, a.orgId);
  if (p.status !== "awaiting_approval") throw new RepairError(409, `Cannot reject a proposal in status ${p.status}`);
  setStatus(db, p, "rejected", "dismissed");
  audit(db, loc.organizationId, a.userId, "repair.rejected", { proposalId: p.id, reason: a.reason });
  emit(db, loc.organizationId, loc.id, null, "proposal_rejected", "Owner rejected a proposed correction.", { proposalId: p.id });
}

/** Approval authorises exactly {platform, listing, field, oldValue, newValue}; execution revalidates against those. */
export async function approveRepair(db: DB, a: { proposalId: string; orgId: string; userId: string; role: string; editedValue?: string }, opts: { paceMs?: number } = {}) {
  if (!canWrite(a.role)) throw new RepairError(403, "Insufficient permissions");
  if (a.editedValue !== undefined) editProposal(db, { ...a, newValue: a.editedValue });
  const { p, d, loc, listing } = load(db, a.proposalId, a.orgId);
  const claimed = db.update(schema.repairProposals).set({ status: "approved", approvedBy: a.userId, approvedAt: now() }).where(and(eq(schema.repairProposals.id, p.id), eq(schema.repairProposals.status, "awaiting_approval"))).run();
  if (claimed.changes !== 1) throw new RepairError(409, `Proposal is not awaiting approval (status: ${p.status})`);
  const fresh = db.select().from(schema.repairProposals).where(eq(schema.repairProposals.id, p.id)).get()!;
  const change = fresh.proposedChangeJson;
  const payload = { platform: fresh.targetPlatform, listingId: listing.id, field: d.fieldName, oldValue: change.oldValue, newValue: change.newValue };
  db.update(schema.repairProposals).set({ approvedPayloadJson: payload }).where(eq(schema.repairProposals.id, p.id)).run();
  db.update(schema.discrepancies).set({ status: "approved" }).where(eq(schema.discrepancies.id, d.id)).run();
  audit(db, loc.organizationId, a.userId, "repair.approved", payload);
  emit(db, loc.organizationId, loc.id, null, "proposal_approved", `Owner approved: ${FIELD_LABELS[d.fieldName as FieldName]} → "${change.newValue}" on ${listingLabel(db, listing)}.`, { proposalId: p.id });

  if (change.capability !== "write" || !getConnector(fresh.targetPlatform)) {
    setStatus(db, fresh, "manual_submission_required");
    emit(db, loc.organizationId, loc.id, null, "manual_submission", "No write integration available. A correction package is ready for manual submission; the next scan will verify it.", { proposalId: p.id });
    return { status: "manual_submission_required" };
  }
  return executeRepair(db, p.id, opts);
}

/** Durable-step execution (each step persists state; maps 1:1 onto Cloudflare Workflow steps). */
export async function executeRepair(db: DB, proposalId: string, opts: { paceMs?: number } = {}) {
  const sleep = (ms: number) => (ms ? new Promise((r) => setTimeout(r, ms)) : undefined);
  const p0 = db.select().from(schema.repairProposals).where(eq(schema.repairProposals.id, proposalId)).get()!;
  const claim = db.update(schema.repairProposals).set({ status: "applying" }).where(and(eq(schema.repairProposals.id, proposalId), eq(schema.repairProposals.status, p0.status === "failed" ? "failed" : "approved"))).run();
  if (claim.changes !== 1) throw new RepairError(409, "Proposal is not executable in its current state");
  const p = db.select().from(schema.repairProposals).where(eq(schema.repairProposals.id, proposalId)).get()!;
  const d = db.select().from(schema.discrepancies).where(eq(schema.discrepancies.id, p.discrepancyId)).get()!;
  const loc = db.select().from(schema.businessLocations).where(eq(schema.businessLocations.id, d.locationId)).get()!;
  const listing = db.select().from(schema.listings).where(eq(schema.listings.id, d.listingId)).get()!;
  const org = loc.organizationId, field = d.fieldName as FieldName, change = p.proposedChangeJson;
  const label = listingLabel(db, listing);
  const ev = (t: string, m: string, meta?: Record<string, unknown>) => emit(db, org, loc.id, null, t, m, { proposalId: p.id, ...meta });
  setStatus(db, p, "applying");
  const fail = (reason: string) => {
    setStatus(db, p, "failed");
    ev("repair_failed", `Correction failed: ${reason}`);
    notify(db, (db.select().from(schema.organizations).where(eq(schema.organizations.id, org)).get()!).ownerUserId, "repair_failed", `${p.id}:failed:${now()}`, { proposalId: p.id, reason });
    return { status: "failed", reason };
  };

  // 1. Connection still authorised?
  const conn = db.select().from(schema.connections).where(and(eq(schema.connections.organizationId, org), eq(schema.connections.platform, p.targetPlatform))).get();
  if (!conn || conn.status !== "connected" || !conn.capabilitiesJson.includes("write")) return fail("connection is missing, expired or lacks write permission");
  ev("revalidating", `Re-reading ${label} before applying the change…`);
  await sleep(opts.paceMs ?? 0);

  // 2. Revalidate target state against what was approved.
  const read = await observeListing(db, listing);
  const current = read.extraction?.[field];
  if (!current) return fail(`could not re-read the target field (${read.error ?? "missing"})`);
  const alreadyCorrect = isMatch(compareField(field, change.newValue, current.raw).classification);
  const unchanged = isMatch(compareField(field, change.oldValue, current.raw).classification);
  if (!alreadyCorrect && !unchanged) {
    setStatus(db, p, "reopened");
    ev("revalidation_required", `The published ${FIELD_LABELS[field].toLowerCase()} changed since approval ("${current.raw}"). Re-approval required.`);
    return { status: "reopened" };
  }

  // 3. Apply (idempotent). An already-correct value is never rewritten.
  if (!alreadyCorrect) {
    const attemptsSoFar = db.select().from(schema.repairAttempts).where(eq(schema.repairAttempts.proposalId, p.id)).all().length;
    const key = crypto.createHash("sha256").update(JSON.stringify([p.id, p.targetPlatform, d.listingId, field, change.oldValue, change.newValue, attemptsSoFar])).digest("hex");
    const inserted = db.insert(schema.repairAttempts).values({ id: newId(), proposalId: p.id, idempotencyKey: key, status: "pending", attemptedAt: now() }).onConflictDoNothing().run();
    if (inserted.changes !== 1) return fail("duplicate attempt suppressed by idempotency key");
    ev("applying", `Submitting approved correction to ${label}…`, { field });
    const res = getConnector(p.targetPlatform)!.applyUpdate(db, listing.externalListingId!, field, String(change.newValue));
    db.update(schema.repairAttempts).set({ connectorResponseJson: res.response, status: res.ok ? "submitted" : "failed" }).where(eq(schema.repairAttempts.idempotencyKey, key)).run();
    audit(db, org, p.approvedBy, "repair.submitted", { proposalId: p.id, ok: res.ok, response: res.response });
    if (!res.ok) return fail("the platform rejected the update");
    ev("submitted", `${label} accepted the update (simulated platform).`, { response: res.response });
  }

  // 4. Verify by re-reading the published value; submission != confirmed.
  setStatus(db, p, "verifying");
  ev("verifying", `Re-reading ${label} to confirm the change took effect…`);
  await sleep(opts.paceMs ?? 0);
  const after = await observeListing(db, listing);
  const now_ = after.extraction?.[field];
  if (!now_ || !isMatch(compareField(field, change.newValue, now_.raw).classification)) return fail("published value did not change after submission");
  db.update(schema.repairAttempts).set({ verifiedAt: now(), status: "verified" }).where(and(eq(schema.repairAttempts.proposalId, p.id), eq(schema.repairAttempts.status, "submitted"))).run();
  db.update(schema.repairProposals).set({ status: "resolved" }).where(eq(schema.repairProposals.id, p.id)).run();
  await recheckListing(db, listing.id); // records the new observation and resolves the discrepancy
  db.update(schema.discrepancies).set({ status: "resolved", resolvedAt: now() }).where(eq(schema.discrepancies.id, d.id)).run();
  const h = snapshotHealth(db, loc.id);
  ev("verified", `Verified: ${label} now shows ${FIELD_LABELS[field].toLowerCase()} "${displayValue(field, now_.raw)}".`, { url: listing.url });
  ev("health_updated", `Presence Health is now ${h.score}%.`, { score: h.score });
  const ownerId = db.select().from(schema.organizations).where(eq(schema.organizations.id, org)).get()!.ownerUserId;
  notify(db, ownerId, "repair_succeeded", `${p.id}:ok`, { proposalId: p.id, field });
  return { status: "resolved", health: h.score };
}

/** Safe retry: only failed proposals, and execution re-reads the target before any write. */
export async function retryRepair(db: DB, a: { proposalId: string; orgId: string; role: string }) {
  if (!canWrite(a.role)) throw new RepairError(403, "Insufficient permissions");
  const { p } = load(db, a.proposalId, a.orgId);
  if (p.status !== "failed") throw new RepairError(409, "Only failed proposals can be retried");
  return executeRepair(db, p.id);
}
