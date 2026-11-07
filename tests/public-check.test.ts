import { describe, it, expect, beforeEach, vi } from "vitest";
import { schema, type DB } from "@/lib/db";
import { openTestDb } from "./helpers";
import { allow, createPublicCheck, normalizeSiteUrl } from "@/lib/public-check";
import { loadCanonical } from "@/lib/canonical";

const site = `<script type="application/ld+json">${JSON.stringify({ "@type": "CafeOrCoffeeShop", name: "Kahvila Aalto", telephone: "+358 9 123 4567", address: { streetAddress: "Esplanadi 1", addressLocality: "Helsinki" }, openingHours: ["Mo-Fr 08:00-18:00"] })}</script>`;

describe("normalizeSiteUrl", () => {
  it("accepts bare domains and full URLs", () => {
    expect(normalizeSiteUrl("cafe.fi")).toBe("https://cafe.fi/");
    expect(normalizeSiteUrl(" https://www.cafe.fi/menu#top ")).toBe("https://www.cafe.fi/menu");
  });
  it("rejects non-public or malformed targets", () => {
    for (const bad of ["", "localhost", "http://127.0.0.1/x", "http://10.0.0.5", "ftp://cafe.fi", "javascript:alert(1)", "http://user:pw@cafe.fi", "http://[::1]/", "intranet", "x".repeat(400)]) {
      expect(() => normalizeSiteUrl(bad), bad).toThrow();
    }
  });
});

describe("rate limiting", () => {
  it("allows up to the limit within a window, then blocks, then resets after the window", async () => {
    const db = openTestDb();
    expect([await allow(db, "k", 2, 1000), await allow(db, "k", 2, 1000), await allow(db, "k", 2, 1000)]).toEqual([true, true, false]);
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 2000);
    expect(await allow(db, "k", 2, 1000)).toBe(true);
    vi.useRealTimers();
  });
});

describe("createPublicCheck", () => {
  let db: DB;
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test";
    db = openTestDb();
    vi.stubGlobal("fetch", async (u: string, init?: { body?: string }) => {
      if (!init?.body) return new Response(new URL(u).hostname === "cafe.fi" ? site : "", { status: new URL(u).hostname === "cafe.fi" ? 200 : 404 });
      const sys = JSON.parse(init.body).messages[0].content as string;
      const content = sys.startsWith("You read an AI assistant's answer") ? JSON.stringify({ mentioned: true, phone: "+358 9 999 0000" }) : "Call +358 9 999 0000.";
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
  });

  it("reads the site, records its facts as UNVERIFIED reference, and audits against them", async () => {
    const r = await createPublicCheck(db, "cafe.fi", "1.2.3.4");
    const audit = (await db.select().from(schema.aiAudits).get())!;
    expect(audit).toMatchObject({ id: r.auditId, basis: "website", status: "completed" });
    const loc = (await db.select().from(schema.businessLocations).get())!;
    expect(loc).toMatchObject({ businessName: "Kahvila Aalto", city: "Helsinki", verificationStatus: "unverified" });
    const rows = await db.select().from(schema.canonicalFieldVersions).all();
    expect(rows.every((x) => x.verificationSource === "website_unverified")).toBe(true);
    expect((await loadCanonical(db, loc.id)).phone?.value).toBe("+358912 34567".replace(/\s/g, ""));
    expect(audit.factsWrong).toBeGreaterThan(0); // the assistants "said" a different phone
  });

  it("stores the open-data lookups on the audit even when every source fails, so the report stops waiting", async () => {
    await createPublicCheck(db, "cafe.fi", "7.7.7.7");
    const a = (await db.select().from(schema.aiAudits).get())!;
    expect(a.publicSourcesJson).toEqual({ osm: null, registry: null, directory: null });
  });

  it("rejects unreadable sites without creating anything, and rate-limits per client", async () => {
    await expect(createPublicCheck(db, "nothing.fi", "9.9.9.9")).rejects.toMatchObject({ status: 422 });
    expect(await db.select().from(schema.users).all()).toHaveLength(0);
    for (let i = 0; i < 10; i++) await createPublicCheck(db, "cafe.fi", "5.5.5.5");
    await expect(createPublicCheck(db, "cafe.fi", "5.5.5.5")).rejects.toMatchObject({ status: 429 });
  });
});

import { contactLinks, headAndTail } from "@/lib/public-check";
import { compareField } from "@/lib/compare";
describe("reading real-world sites", () => {
  it("finds same-site contact pages and ignores external or asset links", () => {
    const html = `<a href="/yhteystiedot">x</a><a href="https://other.fi/contact">x</a><a href="/menu.pdf">x</a><a href="/fi/aukioloajat?x=1">x</a><a href="/blog">x</a><a href="/info">3rd</a>`;
    expect(contactLinks(html, "https://cafe.fi/")).toEqual(["https://cafe.fi/yhteystiedot", "https://cafe.fi/fi/aukioloajat"]);
  });
  it("keeps the footer of long pages, where contact details live", () => {
    const t = "A".repeat(7000) + "PHONE+358 9 123 4567" ;
    expect(headAndTail(t)).toContain("PHONE+358 9 123 4567");
    expect(headAndTail(t).length).toBeLessThan(9000);
  });
  it("treats a different page on the same website as the same website", () => {
    expect(compareField("website", "https://kosmos.fi/", "https://kosmos.fi/en/front-page/").severity).toBeNull();
    expect(compareField("website", "https://kosmos.fi/", "https://other.fi/").severity).toBe("medium");
  });
});

import { osmHoursToText } from "@/lib/osm";
import { scheduleToSchemaOrg, buildJsonLd } from "@/lib/jsonld";
import { parseHours, formatHours } from "@/lib/normalize";
import { platformForUrl } from "@/lib/connectors";
describe("open data sources and structured data", () => {
  it("converts OpenStreetMap opening_hours to text our parser reads, dropping public holidays", () => {
    const t = osmHoursToText("Mo-Fr 08:00-17:00; Sa 09:00-16:00; Su off; PH off")!;
    expect(parseHours(t)).toMatchObject({ mon: "08:00-17:00", fri: "08:00-17:00", sat: "09:00-16:00", sun: "closed" });
    expect(osmHoursToText(undefined)).toBeUndefined();
  });
  it("recognises OpenStreetMap URLs as a platform", () => {
    expect(platformForUrl("https://www.openstreetmap.org/node/9749921601")).toBe("openstreetmap");
  });
  it("builds schema.org hours and a JSON-LD block that our own extractor round-trips", () => {
    const s = parseHours("Mo-Fr 08:00-17:00; Sa 09:00-16:00")!;
    expect(scheduleToSchemaOrg(s)).toEqual(["Mo-Fr 08:00-17:00", "Sa 09:00-16:00"]);
    const html = buildJsonLd({ name: "Aurora", address: "Fleminginkatu 12, Helsinki", city: "Helsinki", phone: "+358 95 550 142", hours: s, website: "https://a.fi/" });
    const ex = extractFromHtml(html, "https://a.fi/")!;
    expect(ex.phone!.value).toBe("+35895550142");
    expect(formatHours(ex.hours!.value as never)).toContain("08:00");
  });
});
import { extractFromHtml } from "@/lib/extract";
