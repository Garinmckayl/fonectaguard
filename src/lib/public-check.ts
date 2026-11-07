import crypto from "crypto";
import { eq } from "drizzle-orm";
import { schema, type DB } from "./db";
import { HttpError } from "./auth";
import { UNCONFIRMED_SOURCE, verifyProfile } from "./canonical";
import { extractFromHtml, fetchPage } from "./extract";
import { extractBusinessFacts } from "./ai";
import { fetchTexts, hasTinyFish } from "./tinyfish";
import { createGuestWorkspace } from "./guest";
import { startAiAudit } from "./ai-audit";
import { enqueuePublicSources } from "./public-sources-job";
import { newId, now } from "./ids";
import type { FieldName } from "./compare";

/** Accepts "example.fi" or a full URL; returns a normalised public http(s) URL or throws a 400. */
export function normalizeSiteUrl(raw: string): string {
  let t = raw.trim();
  if (!t || t.length > 300) throw new HttpError(400, "Enter your business website, e.g. https://example.fi");
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  let u: URL;
  try { u = new URL(t); } catch { throw new HttpError(400, "That does not look like a website address"); }
  const h = u.hostname.toLowerCase();
  const ipLike = /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":") || h.startsWith("[");
  if (!/^https?:$/.test(u.protocol) || !h.includes(".") || ipLike || /(^|\.)(localhost|local|internal|test|example|invalid)$/.test(h) || u.username || u.password) throw new HttpError(400, "Enter a public business website address");
  u.hash = "";
  return u.toString();
}

/** Fixed-window counter in D1. Returns false when the limit is exceeded. */
export async function allow(db: DB, key: string, limit: number, windowMs: number): Promise<boolean> {
  const row = await db.select().from(schema.rateLimits).where(eq(schema.rateLimits.key, key)).get();
  const t = now();
  if (!row || t - row.windowStart >= windowMs) {
    await db.insert(schema.rateLimits).values({ key, windowStart: t, count: 1 }).onConflictDoUpdate({ target: schema.rateLimits.key, set: { windowStart: t, count: 1 } }).run();
    return true;
  }
  if (row.count >= limit) return false;
  await db.update(schema.rateLimits).set({ count: row.count + 1 }).where(eq(schema.rateLimits.key, key)).run();
  return true;
}

export interface SiteFacts { name: string; city: string | null; address?: string; phone?: string; hours?: string; website: string; email?: string }

const cityFromAddress = (a?: string) => {
  const parts = a?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];
  const last = parts[parts.length - 1]?.replace(/^\d{4,5}\s*/, "").trim();
  if (last && !/\d/.test(last)) return last;
  return a?.match(/\b\d{5}\s+([\p{Lu}][\p{L}-]+)/u)?.[1] ?? null; // "Kasarmikatu 2 00130 Helsinki"
};

const CONTACT_HINT = /yhteys|ota-yhteytt|contact|aukiolo|opening|hours|sijainti|location|find-us|visit|info|about|meista/i;

/** Same-host links that probably carry contact details or opening hours (at most 2). */
export function contactLinks(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      if (!/^https?:$/.test(u.protocol) || u.host.replace(/^www\./, "") !== new URL(base).host.replace(/^www\./, "")) continue;
      u.hash = ""; u.search = "";
      if (u.toString() === new URL(base).toString() || !CONTACT_HINT.test(u.pathname) || /\.(pdf|jpg|png|webp)$/i.test(u.pathname)) continue;
      if (!out.includes(u.toString())) out.push(u.toString());
    } catch { /* ignore malformed links */ }
    if (out.length >= 2) break;
  }
  return out;
}

/** Keeps the start and the end of long page text: contact details usually live in the header or footer, not the middle. */
export const headAndTail = (t: string, max = 8800) => (t.length <= max ? t : `${t.slice(0, Math.floor(max * 0.4))}\n…\n${t.slice(-Math.floor(max * 0.6))}`);

/** Reads what the business's own site says about itself: JSON-LD first (exact), otherwise the rendered page (plus its contact page) read by AI with validated output. */
export async function readSiteFacts(url: string): Promise<SiteFacts | null> {
  let links: string[] = [];
  try {
    const p = await fetchPage(url, 8000);
    if (p.ok) {
      const ex = extractFromHtml(p.html, url);
      if (ex?.name && (ex.phone || ex.address || ex.hours)) return { name: ex.name.raw, city: cityFromAddress(ex.address?.raw), address: ex.address?.raw, phone: ex.phone?.raw, hours: ex.hours?.raw, website: url, email: ex.email?.raw };
      links = contactLinks(p.html, url);
    }
  } catch { /* fall through to rendered read */ }
  if (!hasTinyFish()) return null;
  const texts = await fetchTexts([url, ...links]).catch(() => new Map<string, string>());
  const home = texts.get(url);
  if (!home) return null;
  const combined = [home, ...links.map((l) => (texts.get(l) ? `\n--- ${l} ---\n${texts.get(l)}` : ""))].join("");
  const f = await extractBusinessFacts(headAndTail(combined), { url });
  if (!f?.name) return null;
  return { name: f.name, city: f.city || cityFromAddress(f.address ?? undefined), address: f.address ?? undefined, phone: f.phone ?? undefined, hours: f.hours ?? undefined, website: url, email: f.email ?? undefined };
}

export const clientKey = (ip: string) => crypto.createHash("sha256").update(`${process.env.AUTH_SECRET ?? "dev"}:${ip}`).digest("hex").slice(0, 24);

/** Public, read-only check: reads the site, creates an isolated workspace, and audits what AI assistants say against that site's own facts. */
export async function createPublicCheck(db: DB, rawUrl: string, ip: string) {
  const url = normalizeSiteUrl(rawUrl);
  const day = new Date().toISOString().slice(0, 10);
  if (!(await allow(db, `check:ip:${clientKey(ip)}`, 10, 3600_000))) throw new HttpError(429, "You have run several checks in the last hour. Please try again later.");
  if (!(await allow(db, `check:day:${day}`, 300, 86400_000))) throw new HttpError(429, "The free check is at capacity for today. Please try again tomorrow.");
  const facts = await readSiteFacts(url);
  if (!facts) throw new HttpError(422, "We could not read business details from that website. Check the address, or use a page that shows your name, phone and opening hours.");
  if (!facts.phone && !facts.address && !facts.hours) throw new HttpError(422, "That website does not publish a phone number, address or opening hours to compare against.");

  const { userId, orgId } = await createGuestWorkspace(db);
  const locId = newId();
  await db.insert(schema.businessLocations).values({ id: locId, organizationId: orgId, businessName: facts.name, website: url, country: "FI", city: facts.city, addressJson: facts.address ? { street: facts.address, city: facts.city ?? "" } : null, phone: facts.phone ?? null, email: facts.email ?? null, nextScanAt: now() + 86400e3, createdAt: now(), updatedAt: now() }).run();
  // The site's own claims are the reference here, recorded as unverified: nothing is "owner confirmed" until the owner does so.
  const wanted: Partial<Record<FieldName, string | undefined>> = { name: facts.name, address: facts.address, phone: facts.phone, hours: facts.hours, website: url };
  for (const [f, v] of Object.entries(wanted) as [FieldName, string | undefined][]) {
    if (!v) continue;
    try { await verifyProfile(db, locId, userId, { [f]: v }, UNCONFIRMED_SOURCE); } catch { /* value could not be normalised: skip that field */ }
  }
  const { auditId } = await startAiAudit(db, locId, undefined, { basis: "website" });
  await enqueuePublicSources(db, auditId).catch(() => undefined); // open-data lookups run as their own job
  return { auditId, userId, locationId: locId };
}
