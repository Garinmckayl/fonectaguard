import { compareField, FIELD_LABELS, isMatch, type FieldName } from "./compare";
import { extractBusinessFacts } from "./ai";
import { extractFromRaw } from "./extract";
import { matchIdentity } from "./identity";
import { fetchTexts, hasTinyFish, webSearch } from "./tinyfish";

export interface DirectoryFinding {
  source: "Fonecta" | "Finder"; url: string; name?: string;
  checks: { field: string; label: string; state: "match" | "differs" | "missing"; listed?: string; site?: string }[];
}

const isDirectory = (u: string) => /^https?:\/\/(www\.)?(fonecta\.fi\/profiili|finder\.fi\/[^?]*\/yhteystiedot)\//i.test(u);

/** Finds the business's own Fonecta/Finder profile by live search, reads it, confirms it is the same business, and compares it with the website's facts. */
export async function findDirectoryListing(b: { name: string; city: string | null; website: string; address?: string; phone?: string; hours?: unknown }): Promise<DirectoryFinding | null> {
  if (!hasTinyFish()) return null;
  const hits = (await webSearch(`${b.name} ${b.city ?? ""} fonecta.fi`.trim())).map((h) => h.url).filter(isDirectory);
  const candidates = [...new Set(hits)].slice(0, 2);
  if (!candidates.length) return null;
  const texts = await fetchTexts(candidates);
  for (const url of candidates) {
    const text = texts.get(url);
    if (!text) continue;
    const f = await extractBusinessFacts(text, { name: b.name, city: b.city ?? undefined, url });
    if (!f || f.is_target_business === false || !f.name) continue;
    const m = matchIdentity({ name: b.name, address: b.address, phone: b.phone, website: b.website, city: b.city ?? undefined }, { name: f.name, address: f.address ?? undefined, phone: f.phone ?? undefined, website: f.website ?? undefined });
    if (m.verdict === "reject") continue;
    const ex = extractFromRaw({ phone: f.phone ?? undefined, address: f.address ?? undefined, hours: f.hours ?? undefined, website: f.website ?? undefined }, url, 0.8);
    const site: Partial<Record<FieldName, unknown>> = { phone: b.phone, address: b.address, hours: b.hours, website: b.website };
    const checks: DirectoryFinding["checks"] = [];
    for (const field of ["phone", "address", "hours", "website"] as FieldName[]) {
      if (site[field] === undefined || site[field] === null) continue;
      const got = ex[field];
      if (!got) { checks.push({ field, label: FIELD_LABELS[field], state: "missing" }); continue; }
      const c = compareField(field, site[field], got.value);
      checks.push({ field, label: FIELD_LABELS[field], state: isMatch(c.classification) || !c.severity ? "match" : "differs", listed: got.raw });
    }
    return { source: /finder\.fi/i.test(url) ? "Finder" : "Fonecta", url, name: f.name, checks };
  }
  return null;
}
