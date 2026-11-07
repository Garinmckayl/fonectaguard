import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type DB } from "@/lib/db";
import { openTestDb } from "./helpers";
import { BIZ, createWorkspace } from "./fixtures";
import { applyTag, elementXml, hoursToOsm, writeOsmField } from "@/lib/osm-write";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { authorizeUrl, newPkce, readState, signState } from "@/lib/osm-auth";
import { recheckListing } from "@/lib/scan";
import { approveRepair } from "@/lib/repair";
import { parseHours } from "@/lib/normalize";
import { newId } from "@/lib/ids";

/** Changes the last character for certain (a fixed replacement would sometimes be a no-op). */
const flip = (t: string) => t.slice(0, -1) + (t.endsWith("0") ? "1" : "0");

describe("OpenStreetMap tag mapping", () => {
  it("writes hours in OSM syntax, closed days as off, and refuses what it cannot express", () => {
    expect(hoursToOsm("mon-fri 08:00–17:00; sat 09:00–16:00; sun closed")).toBe("Mo-Fr 08:00-17:00; Sa 09:00-16:00; Su off");
    expect(applyTag({}, "hours", "gibberish")).toBeNull();
    expect(applyTag({}, "address", "x")).toBeNull();
  });
  it("reuses the contact: key an object already uses, and never drops existing tags", () => {
    expect(applyTag({ "contact:phone": "+358 1", name: "X" }, "phone", "+358 2")).toEqual({ "contact:phone": "+358 2", name: "X" });
    expect(applyTag({ name: "X" }, "website", "https://x.fi")).toEqual({ name: "X", website: "https://x.fi" });
  });
  it("escapes XML so a value can never break out of the edit", () => {
    const x = elementXml({ type: "node", id: 1, version: 2, lat: 1, lon: 2 }, { name: 'A"B<C&D' }, 9);
    expect(x).toContain('v="A&quot;B&lt;C&amp;D"');
  });
});

describe("credentials and OAuth state", () => {
  it("encrypts tokens at rest and round-trips them", async () => {
    const enc = await encryptSecret("tok_123");
    expect(enc).not.toContain("tok_123");
    expect(await decryptSecret(enc)).toBe("tok_123");
    expect(await encryptSecret("tok_123")).not.toBe(enc); // fresh IV each time
  });
  it("binds state to the browser, rejects tampering, and requests only the scopes we use", () => {
    process.env.OSM_CLIENT_ID = "cid"; process.env.APP_URL = "https://app.test";
    const { state, verifier, challenge } = newPkce();
    expect(readState(signState(state, verifier))).toEqual({ state, verifier });
    expect(readState(flip(signState(state, verifier)))).toBeNull();
    expect(readState(undefined)).toBeNull();
    const u = new URL(authorizeUrl(state, challenge));
    expect(u.searchParams.get("scope")).toBe("read_prefs write_api");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.test/api/connections/osm/callback");
  });
});

function stubOsm(initial: Record<string, string>) {
  const st = { tags: { ...initial }, changesets: 0, closed: 0, puts: 0, auth: "" as string | null };
  vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    const u = new URL(url);
    if (u.hostname !== "api.openstreetmap.org") return new Response("no", { status: 404 });
    if (u.pathname.endsWith("/node/1.json")) return new Response(JSON.stringify({ elements: [{ type: "node", id: 1, version: 3, lat: 60.1, lon: 24.9, tags: st.tags }] }), { status: 200 });
    if (u.pathname.endsWith("/changeset/create")) { st.changesets++; st.auth = init?.headers?.authorization ?? null; return new Response("77", { status: 200 }); }
    if (u.pathname.endsWith("/changeset/77/close")) { st.closed++; return new Response("", { status: 200 }); }
    if (u.pathname.endsWith("/node/1") && init?.method === "PUT") {
      st.puts++;
      st.tags = Object.fromEntries([...init.body!.matchAll(/<tag k="([^"]*)" v="([^"]*)"\/>/g)].map((m) => [m[1], m[2].replace(/&amp;/g, "&")]));
      return new Response("4", { status: 200 });
    }
    return new Response("no", { status: 404 });
  });
  return st;
}

describe("writeOsmField", () => {
  it("creates a changeset, edits the object keeping its other tags, and always closes the changeset", async () => {
    const st = stubOsm({ name: "Aurora", amenity: "cafe" });
    const r = await writeOsmField("tok", "node/1", "phone", "+358 95 550 142", "Aurora");
    expect(r.ok).toBe(true);
    expect(st.tags).toEqual({ name: "Aurora", amenity: "cafe", phone: "+358 95 550 142" });
    expect(st.auth).toBe("Bearer tok");
    expect([st.changesets, st.closed]).toEqual([1, 1]);
  });
  it("reports a clear error and still closes the changeset when OSM rejects the edit", async () => {
    const st = stubOsm({ name: "A" });
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: { method?: string }) => (new URL(url).pathname.endsWith("/node/1") && init?.method === "PUT" ? new Response("conflict", { status: 409 }) : real(url, init as never)));
    const r = await writeOsmField("tok", "node/1", "phone", "+358 1", "A");
    expect(r.ok).toBe(false);
    expect(String(r.response.error)).toContain("retry");
    expect(st.closed).toBe(1);
  });
  it("refuses relations and unsupported fields without calling OSM", async () => {
    const st = stubOsm({});
    expect((await writeOsmField("tok", "relation/9", "phone", "x", "A")).ok).toBe(false);
    expect((await writeOsmField("tok", "node/1", "address", "x", "A")).ok).toBe(false);
    expect(st.changesets).toBe(0);
  });
});

describe("OpenStreetMap end to end: gap detected, approved, edited, verified", () => {
  let db: DB, ids: { userId: string; orgId: string; locId: string }, st: ReturnType<typeof stubOsm>, listingId: string;
  beforeEach(async () => {
    process.env.OSM_CLIENT_ID = "cid";
    db = openTestDb();
    ids = await createWorkspace(db);
    st = stubOsm({ name: BIZ.name, website: BIZ.site });
    await db.insert(schema.connections).values({ id: "conn-osm", organizationId: ids.orgId, platform: "openstreetmap", externalAccountId: "owner_account", status: "connected", capabilitiesJson: ["read", "write", "verify"], encryptedCredentialReference: await encryptSecret("tok-live"), expiresAt: null, lastSyncedAt: Date.now() }).run();
    listingId = newId();
    await db.insert(schema.listings).values({ id: listingId, locationId: ids.locId, platform: "openstreetmap", externalListingId: "node/1", url: "https://www.openstreetmap.org/node/1", identityConfidence: 0.9, discoveredAt: Date.now() }).run();
  });

  it("turns missing phone and hours into approvable write proposals, then edits and verifies through the OSM API", async () => {
    await recheckListing(db, listingId);
    const props = await db.select().from(schema.repairProposals).all();
    expect(props.map((p) => p.proposedChangeJson.field).sort()).toEqual(["hours", "phone"]);
    expect(props.every((p) => p.proposedChangeJson.capability === "write" && p.status === "awaiting_approval")).toBe(true);
    expect(st.puts).toBe(0);

    for (const p of props) expect((await approveRepair(db, { proposalId: p.id, orgId: ids.orgId, userId: ids.userId, role: "owner" })).status).toBe("resolved");
    expect(st.tags.phone).toBe("+358 95 550 142");
    expect(st.tags.opening_hours).toBe("Mo-Fr 08:00-17:00; Sa 09:00-16:00; Su off");
    expect(st.tags.name).toBe(BIZ.name);
    expect(st.puts).toBe(2);
    expect(await db.select().from(schema.discrepancies).where(eq(schema.discrepancies.status, "resolved")).all()).toHaveLength(2);
  });

  it("without a connected account the same gaps become guided manual submissions, and nothing is written", async () => {
    await db.update(schema.connections).set({ status: "revoked", encryptedCredentialReference: null }).where(eq(schema.connections.id, "conn-osm")).run();
    await recheckListing(db, listingId);
    const props = await db.select().from(schema.repairProposals).all();
    expect(props.every((p) => p.proposedChangeJson.capability !== "write")).toBe(true);
    expect(parseHours(BIZ.hours)).toBeTruthy();
    expect(st.puts).toBe(0);
  });
});
