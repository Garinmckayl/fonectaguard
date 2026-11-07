import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type DB } from "@/lib/db";
import { openTestDb } from "./helpers";
import { BIZ, createWorkspace } from "./fixtures";
import { appSecretProof, authorizeUrl, exchangeCode, fbHoursToText, listManagedPages, readFbState, signFbState, newState, textToFbHours, writeFacebookField } from "@/lib/facebook";
import { pendingPages, savePendingPages, selectPage } from "@/lib/facebook-connect";
import { fbConnection } from "@/lib/facebook-creds";
import { approveRepair } from "@/lib/repair";
import { recheckListing } from "@/lib/scan";
import { verifyProfile } from "@/lib/canonical";
import { parseHours } from "@/lib/normalize";

beforeEach(() => { process.env.META_APP_ID = "123"; process.env.META_APP_SECRET = "shhh"; process.env.APP_URL = "https://app.test"; delete process.env.META_GRAPH_VERSION; });

/** Changes the last character for certain (a fixed replacement would sometimes be a no-op). */
const flip = (t: string) => t.slice(0, -1) + (t.endsWith("0") ? "1" : "0");

describe("Facebook hours and login helpers", () => {
  it("round-trips Page hours (closed days omitted) through the weekly text our parser reads", () => {
    const dict = { mon_1_open: "08:00", mon_1_close: "17:00", sat_1_open: "09:00", sat_1_close: "16:00" };
    const text = fbHoursToText(dict)!;
    expect(parseHours(text)).toMatchObject({ mon: "08:00-17:00", tue: "closed", sat: "09:00-16:00", sun: "closed" });
    expect(textToFbHours("mon-fri 08:00–17:00; sat 09:00–16:00; sun closed")).toEqual({
      mon_1_open: "08:00", mon_1_close: "17:00", tue_1_open: "08:00", tue_1_close: "17:00", wed_1_open: "08:00", wed_1_close: "17:00", thu_1_open: "08:00", thu_1_close: "17:00", fri_1_open: "08:00", fri_1_close: "17:00", sat_1_open: "09:00", sat_1_close: "16:00" });
    expect(textToFbHours("nonsense")).toBeNull();
    expect(fbHoursToText(undefined)).toBeUndefined();
  });
  it("uses a saved Login for Business configuration instead of scope when one is configured", () => {
    process.env.META_LOGIN_CONFIG_ID = "cfg_9";
    const u = new URL(authorizeUrl("st"));
    expect(u.searchParams.get("config_id")).toBe("cfg_9");
    expect(u.searchParams.get("scope")).toBeNull();
    expect(u.searchParams.get("override_default_response_type")).toBe("true");
    delete process.env.META_LOGIN_CONFIG_ID;
  });
  it("asks only for Page permissions, signs the state, and proves the app secret on server calls", () => {
    const u = new URL(authorizeUrl("st"));
    expect(u.searchParams.get("scope")).toBe("pages_show_list,pages_read_engagement,pages_manage_metadata,business_management");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.test/api/connections/facebook/callback");
    const s = newState();
    expect(readFbState(signFbState(s))).toBe(s);
    expect(readFbState(flip(signFbState(s)))).toBeNull();
    expect(appSecretProof("tok")).toMatch(/^[0-9a-f]{64}$/);
  });
});

function stubGraph(page: { name: string; phone?: string; website?: string; hours?: Record<string, string> }) {
  const st = { page: { ...page }, posts: [] as URLSearchParams[], proofOk: true };
  vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: URLSearchParams }) => {
    const u = new URL(url);
    if (u.hostname !== "graph.facebook.com") return new Response("no", { status: 404 });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (u.pathname.endsWith("/oauth/access_token")) return json({ access_token: u.searchParams.get("grant_type") ? "LONG_USER" : "SHORT_USER" });
    if (u.pathname.endsWith("/me/accounts")) return json({ data: [{ id: "555", name: "Aurora Page", access_token: "PAGE_TOKEN", tasks: ["MANAGE", "CREATE_CONTENT"] }, { id: "666", name: "Not mine", access_token: "T2", tasks: ["ANALYZE"] }] });
    if (u.pathname.endsWith("/555") && init?.method === "POST") {
      const b = init.body!; st.posts.push(b);
      if (b.get("appsecret_proof") !== appSecretProof("PAGE_TOKEN") || b.get("access_token") !== "PAGE_TOKEN") { st.proofOk = false; return json({ error: { message: "bad proof" } }, 400); }
      if (b.get("phone")) st.page.phone = b.get("phone")!;
      if (b.get("website")) st.page.website = b.get("website")!;
      if (b.get("hours")) st.page.hours = JSON.parse(b.get("hours")!);
      return json({ success: true });
    }
    if (u.pathname.endsWith("/555")) return json({ id: "555", link: "https://www.facebook.com/555", ...st.page });
    return json({ error: { message: "unknown" } }, 404);
  });
  return st;
}

describe("Facebook Graph calls", () => {
  it("exchanges the code for a long-lived token and lists only Pages the user fully manages", async () => {
    stubGraph({ name: "Aurora Page" });
    const tok = await exchangeCode("code");
    expect(tok).toBe("LONG_USER");
    expect((await listManagedPages(tok)).map((p) => p.name)).toEqual(["Aurora Page"]);
  });
  it("refuses fields it does not edit without calling Facebook", async () => {
    const st = stubGraph({ name: "x" });
    expect((await writeFacebookField("555", "PAGE_TOKEN", "address", "x")).ok).toBe(false);
    expect(st.posts).toHaveLength(0);
  });
});

describe("Pages owned through a Business portfolio", () => {
  it("are found through the business when /me/accounts is empty", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const u = new URL(url); const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (u.pathname.endsWith("/me/accounts")) return json({ data: [] });
      if (u.pathname.endsWith("/me/businesses")) return json({ data: [{ id: "b1" }] });
      if (u.pathname.endsWith("/b1/owned_pages")) return json({ data: [{ id: "900", name: "Cafe Biz", access_token: "BT", tasks: ["MANAGE", "ADVERTISE"] }, { id: "901", name: "Read only", access_token: "BT2", tasks: ["ANALYZE"] }] });
      if (u.pathname.endsWith("/b1/client_pages")) return json({ data: [] });
      return json({ data: [] });
    });
    expect(await listManagedPages("USER")).toEqual([{ id: "900", name: "Cafe Biz", token: "BT" }]);
  });
});

describe("Facebook end to end: connect a Page, find the gaps, approve, edit, verify", () => {
  let db: DB, ids: { userId: string; orgId: string; locId: string }, st: ReturnType<typeof stubGraph>;
  beforeEach(async () => { db = openTestDb(); ids = await createWorkspace(db); st = stubGraph({ name: BIZ.name, website: BIZ.site }); });

  it("stores the Page token encrypted, monitors the Page, turns missing phone and hours into write proposals, and verifies the edit", async () => {
    await savePendingPages(db, ids.orgId, [{ id: "555", name: "Aurora Page", token: "PAGE_TOKEN" }]);
    expect((await pendingPages(db, ids.orgId)).map((p) => p.id)).toEqual(["555"]);
    await selectPage(db, ids.orgId, ids.userId, { id: "555", name: "Aurora Page", token: "PAGE_TOKEN" });

    const conn = (await db.select().from(schema.connections).where(eq(schema.connections.platform, "facebook")).get())!;
    expect(conn.status).toBe("connected");
    expect(conn.encryptedCredentialReference).not.toContain("PAGE_TOKEN");
    expect((await fbConnection(db, ids.orgId))?.token).toBe("PAGE_TOKEN");

    const props = await db.select().from(schema.repairProposals).all();
    expect(props.map((p) => p.proposedChangeJson.field).sort()).toEqual(["hours", "phone"]);
    expect(props.every((p) => p.proposedChangeJson.capability === "write")).toBe(true);
    expect(st.posts).toHaveLength(0); // nothing is written before approval

    for (const p of props) expect((await approveRepair(db, { proposalId: p.id, orgId: ids.orgId, userId: ids.userId, role: "owner" })).status).toBe("resolved");
    expect(st.proofOk).toBe(true);
    expect(st.page.phone).toBe("+358 95 550 142");
    expect(st.page.hours).toMatchObject({ mon_1_open: "08:00", fri_1_close: "17:00", sat_1_open: "09:00", sat_1_close: "16:00" });
    expect(st.page.hours).not.toHaveProperty("sun_1_open");
    expect(st.page.website).toBe(BIZ.site); // untouched
  });

  it("a connected Page can be fixed without a verified domain, but nothing else can", async () => {
    await db.update(schema.businessLocations).set({ verificationStatus: "unverified" }).where(eq(schema.businessLocations.id, ids.locId)).run();
    await selectPage(db, ids.orgId, ids.userId, { id: "555", name: "Aurora Page", token: "PAGE_TOKEN" });
    const fb = (await db.select().from(schema.repairProposals).all()).find((p) => p.proposedChangeJson.field === "phone")!;
    expect((await approveRepair(db, { proposalId: fb.id, orgId: ids.orgId, userId: ids.userId, role: "owner" })).status).toBe("resolved");
    // A proposal for any other listing is still refused while the domain is unverified.
    const lid = "other-listing", did = "other-disc", pid = "other-prop";
    await db.insert(schema.listings).values({ id: lid, locationId: ids.locId, platform: "fonecta", url: "https://www.fonecta.fi/x", identityConfidence: 0.9, discoveredAt: Date.now() }).run();
    await db.insert(schema.discrepancies).values({ id: did, locationId: ids.locId, listingId: lid, fieldName: "phone", severity: "high", confidence: 0.8, explanation: "x", impact: "x", classification: "likely", status: "awaiting_approval", firstDetectedAt: Date.now(), lastSeenAt: Date.now() }).run();
    await db.insert(schema.repairProposals).values({ id: pid, discrepancyId: did, targetPlatform: "fonecta", proposedChangeJson: { field: "phone", oldValue: "x", newValue: "+358 95 550 142", action: "manual_submission", capability: "manual_approval_link", risk: "low" }, evidenceJson: {}, confidence: 0.8, explanation: "x", status: "awaiting_approval", createdAt: Date.now() }).run();
    await expect(approveRepair(db, { proposalId: pid, orgId: ids.orgId, userId: ids.userId, role: "owner" })).rejects.toMatchObject({ status: 403 });
  });

  it("an open proposal follows the owner's newly confirmed value instead of carrying a superseded one", async () => {
    await selectPage(db, ids.orgId, ids.userId, { id: "555", name: "Aurora Page", token: "PAGE_TOKEN" });
    const open = async () => (await db.select().from(schema.repairProposals).all()).find((p) => p.proposedChangeJson.field === "hours")!;
    expect(String((await open()).proposedChangeJson.newValue)).toContain("08:00–17:00");
    await verifyProfile(db, ids.locId, ids.userId, { hours: "Mon-Fri 09:00-18:00; Sat closed; Sun closed" }, "owner_confirmed");
    const l = (await db.select().from(schema.listings).where(eq(schema.listings.platform, "facebook")).get())!;
    await recheckListing(db, l.id);
    expect(String((await open()).proposedChangeJson.newValue)).toContain("09:00–18:00");
    expect(await db.select().from(schema.repairProposals).all()).toHaveLength(2); // still one per field, no duplicates
  });

  it("after disconnecting, the stored token is gone and edits are no longer possible", async () => {
    await selectPage(db, ids.orgId, ids.userId, { id: "555", name: "Aurora Page", token: "PAGE_TOKEN" });
    await db.update(schema.connections).set({ status: "revoked", encryptedCredentialReference: null }).where(eq(schema.connections.platform, "facebook")).run();
    expect(await fbConnection(db, ids.orgId)).toBeNull();
  });
});
