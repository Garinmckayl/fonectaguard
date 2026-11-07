import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type DB } from "@/lib/db";
import { openTestDb } from "./helpers";
import { compareField } from "@/lib/compare";
import { matchIdentity } from "@/lib/identity";
import { parseHours } from "@/lib/normalize";
import { computeHealthScore } from "@/lib/health";
import { BIZ, createWorkspace, stubGithubAndSite } from "./fixtures";
import { executeScan, locationHealth } from "@/lib/scan";
import { approveRepair, RepairError, retryRepair } from "@/lib/repair";
import { newId } from "@/lib/ids";
import { UNCONFIRMED_SOURCE, loadCanonical, verifyProfile } from "@/lib/canonical";

describe("discrepancy detection", () => {
  it("flags wrong phone as high, tolerates formatting", () => {
    expect(compareField("phone", "+358401234567", "+358 40 123 9876")).toMatchObject({ classification: "likely", severity: "high" });
    expect(compareField("phone", "+358401234567", "040 123 4567").classification).toBe("equivalent");
  });
  it("flags earlier closing time and old address", () => {
    expect(compareField("hours", parseHours("08:00-22:00"), "08:00–20:00")).toMatchObject({ classification: "likely", severity: "high" });
    expect(compareField("address", "Fleminginkatu 12, Helsinki", "Old Road 3, Helsinki").severity).toBe("critical");
  });
  it("does not raise false alarms for description variation or missing fields", () => {
    expect(compareField("description", "Modern Italian restaurant", "Authentic Italian dining").severity).toBeNull();
    expect(compareField("email", "a@b.fi", undefined).classification).toBe("missing");
  });
  it("does not flag cosmetic differences (accents, spacing, postcode)", () => {
    expect(compareField("name", "CafeArt", "Café Art").classification).toBe("equivalent");
    expect(compareField("address", "Läntinen Rantakatu 5, 20100 Turku", "Läntinen rantakatu 5, Turku").classification).toBe("equivalent");
    expect(compareField("address", "Läntinen Rantakatu 5, 20100 Turku", "Läntinen Rantakatu 15, Turku").severity).toBe("critical");
  });
  it("parses Finnish hours", () => {
    expect(parseHours("ma-pe 8-22; la 10-18; su suljettu")).toMatchObject({ mon: "08:00-22:00", sat: "10:00-18:00", sun: "closed" });
  });
  it("never reports perfect health with no data", () => {
    expect(computeHealthScore([]).status).toBe("insufficient");
  });
  it("rejects name-only identity matches", () => {
    const c = { name: BIZ.name, website: "http://a.example", phone: "+358401234567", address: "X 1, Turku", city: "Turku" };
    expect(matchIdentity(c, { name: BIZ.name, address: "Other 1, Oulu", phone: "+358405550000", website: "http://b.example" }).verdict).toBe("reject");
  });
});

describe("scan → approve → repair → verify (real GitHub connector, stubbed GitHub API and site)", () => {
  let db: DB, ids: { userId: string; orgId: string; locId: string }, site: ReturnType<typeof stubGithubAndSite>;
  const STALE = { phone: "+358 9 555 0100", hours: "Mo-Fr 08:00-15:00; Sa 09:00-12:00" };
  beforeEach(async () => {
    db = openTestDb();
    ids = await createWorkspace(db);
    site = stubGithubAndSite(STALE);
  });
  const scan = async () => {
    const scanId = newId();
    (await db.insert(schema.scanRuns).values({ id: scanId, locationId: ids.locId, status: "running", triggerType: "manual", startedAt: Date.now() }).run());
    await executeScan(db, ids.locId, scanId);
  };
  const proposals = async () => (await db.select().from(schema.repairProposals).all());
  const approve = (id: string, role = "owner", orgId = ids.orgId) => approveRepair(db, { proposalId: id, orgId, userId: ids.userId, role });

  it("detects the stale phone and hours on the live site and does not duplicate on rescan", async () => {
    await scan();
    expect((await db.select().from(schema.discrepancies).all()).map((d) => d.fieldName).sort()).toEqual(["hours", "phone"]);
    await scan();
    expect(await db.select().from(schema.discrepancies).all()).toHaveLength(2);
    expect(await proposals()).toHaveLength(2);
    expect((await proposals()).every((p) => p.status === "awaiting_approval" && p.proposedChangeJson.capability === "write")).toBe(true);
    expect((await locationHealth(db, ids.locId)).score).toBeLessThan(100);
  });

  it("requires owner approval; the repair commits to GitHub, waits for the live page, verifies by re-reading", async () => {
    await scan();
    const before = (await locationHealth(db, ids.locId)).score!;
    const p = (await proposals()).find((x) => x.proposedChangeJson.field === "phone")!;
    await expect(approve(p.id, "viewer")).rejects.toBeInstanceOf(RepairError);
    await expect(approve(p.id, "owner", "other-org")).rejects.toMatchObject({ status: 404 });
    expect(site.puts).toBe(0);

    const res = await approve(p.id);
    expect(res.status).toBe("resolved");
    expect(site.puts).toBe(1);
    expect(site.html).toContain(BIZ.phone);
    expect(await db.select().from(schema.repairProposals).where(eq(schema.repairProposals.id, p.id)).get()).toMatchObject({ status: "resolved", approvedBy: ids.userId });
    expect((await locationHealth(db, ids.locId)).score!).toBeGreaterThan(before);
    expect((await db.select().from(schema.discrepancies).where(eq(schema.discrepancies.id, p.discrepancyId)).get())!.status).toBe("resolved");
  });

  it("is idempotent: second approval/retry never writes again", async () => {
    await scan();
    const p = (await proposals())[0];
    await approve(p.id);
    await expect(approve(p.id)).rejects.toMatchObject({ status: 409 });
    await expect(retryRepair(db, { proposalId: p.id, orgId: ids.orgId, role: "owner" })).rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(schema.repairAttempts).where(eq(schema.repairAttempts.proposalId, p.id)).all()).toHaveLength(1);
    expect(site.puts).toBe(1);
  });

  it("requires re-approval if the live value changed after detection, and writes nothing", async () => {
    await scan();
    const p = (await proposals()).find((x) => x.proposedChangeJson.field === "phone")!;
    site.html = site.html.replaceAll(STALE.phone, "+358 9 555 9999");
    const res = await approve(p.id);
    expect(res.status).toBe("reopened");
    expect(site.puts).toBe(0);
    expect(await db.select().from(schema.repairAttempts).all()).toHaveLength(0);
  });

  it("refuses to approve a correction against a value that was only read from a website, until the owner confirms it", async () => {
    await verifyProfile(db, ids.locId, ids.userId, { phone: "+358 9 111 2222" }, UNCONFIRMED_SOURCE);
    const listingId = newId(), discId = newId(), pid = newId();
    await db.insert(schema.listings).values({ id: listingId, locationId: ids.locId, platform: "fonecta", url: "https://www.fonecta.fi/x", identityConfidence: 0.9, discoveredAt: Date.now() }).run();
    await db.insert(schema.discrepancies).values({ id: discId, locationId: ids.locId, listingId, fieldName: "phone", observedValueJson: "x", expectedValueJson: "+35891112222", severity: "high", confidence: 0.8, explanation: "x", impact: "x", classification: "likely", status: "awaiting_approval", firstDetectedAt: Date.now(), lastSeenAt: Date.now() }).run();
    await db.insert(schema.repairProposals).values({ id: pid, discrepancyId: discId, targetPlatform: "fonecta", proposedChangeJson: { field: "phone", oldValue: "x", newValue: "+358 9 111 2222", action: "manual_submission", capability: "manual_approval_link", risk: "low" }, evidenceJson: {}, confidence: 0.8, explanation: "x", status: "awaiting_approval", createdAt: Date.now() }).run();
    await expect(approve(pid)).rejects.toMatchObject({ status: 403 });
    // Same value, now confirmed by the owner: version is bumped and the source upgraded.
    expect(await verifyProfile(db, ids.locId, ids.userId, { phone: "+358 9 111 2222" }, "owner_confirmed")).toEqual(["phone"]);
    expect((await loadCanonical(db, ids.locId)).phone).toMatchObject({ source: "owner_confirmed" });
    expect((await approve(pid)).status).toBe("manual_submission_required");
  });

  it("a correction on a directory without a write API becomes a guided manual submission, verified by re-reading", async () => {
    // A Fonecta listing found by live search: readable, not writable.
    const listingId = newId();
    await db.insert(schema.listings).values({ id: listingId, locationId: ids.locId, platform: "fonecta", url: "https://www.fonecta.fi/yritykset/aurora", identityConfidence: 0.9, discoveredAt: Date.now() }).run();
    const discId = newId();
    await db.insert(schema.discrepancies).values({ id: discId, locationId: ids.locId, listingId, fieldName: "phone", observedValueJson: "+358 9 555 0100", expectedValueJson: BIZ.phone, severity: "high", confidence: 0.8, explanation: "x", impact: "x", classification: "likely", status: "awaiting_approval", firstDetectedAt: Date.now(), lastSeenAt: Date.now() }).run();
    const pid = newId();
    await db.insert(schema.repairProposals).values({ id: pid, discrepancyId: discId, targetPlatform: "fonecta", proposedChangeJson: { field: "phone", oldValue: "+358 9 555 0100", newValue: BIZ.phone, action: "manual_submission", capability: "manual_approval_link", risk: "low" }, evidenceJson: {}, confidence: 0.8, explanation: "x", status: "awaiting_approval", createdAt: Date.now() }).run();
    expect((await approve(pid)).status).toBe("manual_submission_required");
    expect(site.puts).toBe(0); // nothing was written anywhere
  });
});

describe("real-world phone formats", () => {
  it("treats the national trunk 0 after the country code as formatting, not a different number", () => {
    expect(compareField("phone", "+358 09 652 817", "+358 96 528 17").classification).toBe("equivalent");
    expect(compareField("phone", "+358 9 652 817", "09 652 817").classification).toBe("equivalent");
    expect(compareField("phone", "+358 9 652 817", "+358 9 652 818").severity).toBe("high");
  });
});
