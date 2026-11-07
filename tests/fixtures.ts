import { vi } from "vitest";
import { schema, type DB } from "@/lib/db";
import { verifyProfile } from "@/lib/canonical";
import { newId, now } from "@/lib/ids";

export const BIZ = {
  name: "Aurora Coffee Roasters", city: "Helsinki", street: "Fleminginkatu 12", address: "Fleminginkatu 12, Helsinki",
  phone: "+358 95 550 142", hours: "Mo-Fr 08:00-17:00; Sa 09:00-16:00", site: "https://pages.test/shop/", repo: "owner/shop",
};

/** A real workspace row set: verified owner, business, verified profile, and a GitHub Pages write connection. */
export async function createWorkspace(db: DB) {
  const userId = newId(), orgId = newId(), locId = newId();
  await db.insert(schema.users).values({ id: userId, name: "Owner", email: `o-${userId}@x.test`, createdAt: now() }).run();
  await db.insert(schema.organizations).values({ id: orgId, name: "Aurora", ownerUserId: userId, createdAt: now() }).run();
  await db.insert(schema.organizationMembers).values({ id: newId(), organizationId: orgId, userId, role: "owner" }).run();
  await db.insert(schema.businessLocations).values({
    id: locId, organizationId: orgId, businessName: BIZ.name, website: BIZ.site, country: "FI", city: BIZ.city, addressJson: { street: BIZ.street, city: BIZ.city },
    phone: BIZ.phone, verificationStatus: "verified", monitoringFrequency: "daily", nextScanAt: now() + 86400e3, createdAt: now(), updatedAt: now(),
  }).run();
  await verifyProfile(db, locId, userId, { name: BIZ.name, address: BIZ.address, phone: BIZ.phone, hours: BIZ.hours, website: BIZ.site }, "owner_confirmed");
  await db.insert(schema.connections).values({ id: newId(), organizationId: orgId, platform: "github", externalAccountId: BIZ.repo, status: "connected", capabilitiesJson: ["read", "write", "verify"], expiresAt: null, lastSyncedAt: now() }).run();
  return { userId, orgId, locId };
}

export const pageHtml = (o: { phone: string; hours: string }) =>
  `<html><script type="application/ld+json">${JSON.stringify({ "@type": "CafeOrCoffeeShop", name: BIZ.name, url: BIZ.site, telephone: o.phone, address: { streetAddress: BIZ.street, addressLocality: BIZ.city }, openingHours: [o.hours] })}</script><dd id="phone">${o.phone}</dd></html>`;

/** Stands in for the outside world only: the GitHub contents API and the Pages-served site. Product code runs unmodified. */
export function stubGithubAndSite(initial: { phone: string; hours: string }) {
  const state = { html: pageHtml(initial), puts: 0, apiGets: 0 };
  vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => {
    const u = new URL(url);
    if (u.hostname === "pages.test") return new Response(state.html, { status: 200 });
    if (u.hostname === "api.github.com" && u.pathname === `/repos/${BIZ.repo}/contents/index.html`) {
      if (init?.method === "PUT") {
        state.puts++;
        state.html = Buffer.from(JSON.parse(init.body!).content, "base64").toString("utf8");
        return new Response(JSON.stringify({ commit: { sha: "abc123", html_url: "https://github.com/owner/shop/commit/abc123" } }), { status: 200 });
      }
      state.apiGets++;
      return new Response(JSON.stringify({ content: Buffer.from(state.html).toString("base64"), sha: "sha1" }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
  process.env.GITHUB_PAGES_TOKEN = "test";
  process.env.PAGES_POLL_MS = "1";
  return state;
}
