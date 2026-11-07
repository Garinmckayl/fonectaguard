import { extractFromRaw, type Extraction } from "./extract";
import { matchIdentity, type IdentitySignals } from "./identity";

const UA = "FonectaGuard/1.0 (AI Hackathon 2026; https://fonectaguard.arcumet.com)";
const BASE = "https://nominatim.openstreetmap.org";

export interface OsmPlace { score?: number; type: "node" | "way" | "relation"; id: number; url: string; name: string; tags: Record<string, string>; extraction: Extraction; missing: string[] }

/** OSM opening_hours syntax -> the compact weekly text our parser reads. Public holidays and 24/7 are dropped or expanded. */
export function osmHoursToText(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (/^24\/7$/.test(raw.trim())) return "Mon-Sun 00:00-24:00";
  const parts = raw.split(";").map((p) => p.trim()).filter((p) => p && !/^(PH|SH)\b/.test(p));
  return parts.length ? parts.map((p) => p.replace(/\boff\b/gi, "closed")).join("; ") : undefined;
}

export const osmEditUrl = (url: string) => url.replace(/\/(node|way|relation)\/(\d+)/, "/edit?$1=$2");

function toPlace(r: { osm_type?: string; osm_id?: number; name?: string; extratags?: Record<string, string>; address?: Record<string, string> }): OsmPlace | null {
  if (!r.osm_type || !r.osm_id || !["node", "way", "relation"].includes(r.osm_type)) return null;
  const t = r.extratags ?? {}, a = r.address ?? {};
  const street = [a.road, a.house_number].filter(Boolean).join(" ");
  const raw = {
    name: r.name,
    address: street ? [street, a.city ?? a.town ?? a.village].filter(Boolean).join(", ") : undefined,
    phone: t.phone ?? t["contact:phone"],
    hours: osmHoursToText(t.opening_hours),
    website: t.website ?? t["contact:website"],
    email: t.email ?? t["contact:email"],
  };
  const url = `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}`;
  const missing = [!raw.hours && "opening hours", !raw.phone && "phone", !raw.website && "website", !raw.address && "address"].filter(Boolean) as string[];
  return { type: r.osm_type as OsmPlace["type"], id: r.osm_id, url, name: r.name ?? "", tags: t, extraction: extractFromRaw(raw, url, 0.9), missing };
}

async function nominatim(path: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${BASE}${path}`, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return (await res.json()) as Record<string, unknown>[];
}

/** Finds the business on OpenStreetMap (no key needed) and confirms it is the same business by independent signals. */
export async function findOsm(who: IdentitySignals & { name: string }, country = "fi"): Promise<OsmPlace | null> {
  const q = encodeURIComponent(`${who.name} ${who.city ?? ""}`.trim());
  const rows = await nominatim(`/search?q=${q}&format=jsonv2&extratags=1&addressdetails=1&limit=6&countrycodes=${country.toLowerCase().slice(0, 2)}`);
  let best: { p: OsmPlace; score: number } | null = null;
  for (const r of rows as Parameters<typeof toPlace>[0][]) {
    const p = toPlace(r);
    if (!p) continue;
    const ex = p.extraction;
    const m = matchIdentity(who, { name: p.name, address: ex.address?.raw, phone: ex.phone?.raw, website: ex.website?.raw });
    if (m.verdict !== "reject" && (!best || m.score > best.score)) best = { p, score: m.score };
  }
  return best ? { ...best.p, score: best.score } : null;
}

/** Re-reads one OSM object straight from the OSM API (authoritative and immediate; Nominatim lags behind edits). */
export async function readOsm(osmRef: string): Promise<OsmPlace | null> {
  const m = osmRef.match(/(node|way|relation)\/(\d+)/);
  if (!m) return null;
  const res = await fetch(`https://api.openstreetmap.org/api/0.6/${m[1]}/${m[2]}.json`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const el = ((await res.json()) as { elements?: { tags?: Record<string, string> }[] }).elements?.[0];
  if (!el) return null;
  const t = el.tags ?? {};
  return toPlace({ osm_type: m[1], osm_id: Number(m[2]), name: t.name, extratags: t, address: { road: t["addr:street"], house_number: t["addr:housenumber"], city: t["addr:city"] } });
}
