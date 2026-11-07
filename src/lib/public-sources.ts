import { compareField, isMatch, FIELD_LABELS, type FieldName } from "./compare";
import { findOsm, osmEditUrl } from "./osm";
import { lookupRegistry, type RegistryHit } from "./registry";
import { findDirectoryListing, type DirectoryFinding } from "./fonecta";

export interface OsmFinding {
  found: boolean; url?: string; editUrl?: string;
  checks: { field: string; label: string; state: "match" | "differs" | "missing"; osm?: string; site?: string }[];
}
export interface PublicSources { osm: OsmFinding | null; registry: RegistryHit | null; directory?: DirectoryFinding | null }

/** Open public data about a business, gathered without any API key or partner approval. Each lookup is best-effort. */
export async function gatherPublicSources(b: { name: string; city: string | null; website: string; address?: string; phone?: string; hours?: unknown; country?: string }): Promise<PublicSources> {
  const [dirR, osmR, regR] = await Promise.allSettled([
    findDirectoryListing({ name: b.name, city: b.city, website: b.website, address: b.address, phone: b.phone, hours: b.hours }),
    findOsm({ name: b.name, city: b.city ?? undefined, website: b.website, address: b.address, phone: b.phone }, b.country ?? "fi"),
    lookupRegistry({ name: b.name, city: b.city, website: b.website, address: b.address }),
  ]);
  const place = osmR.status === "fulfilled" ? osmR.value : null;
  let osm: OsmFinding | null = null;
  if (osmR.status === "fulfilled") {
    if (!place) osm = { found: false, checks: [] };
    else {
      const site: Partial<Record<FieldName, unknown>> = { hours: b.hours, phone: b.phone, address: b.address, website: b.website };
      const checks: OsmFinding["checks"] = [];
      for (const f of ["hours", "phone", "website", "address"] as FieldName[]) {
        if (site[f] === undefined || site[f] === null) continue;
        const ex = place.extraction[f];
        if (!ex) { checks.push({ field: f, label: FIELD_LABELS[f], state: "missing" }); continue; }
        const c = compareField(f, site[f], ex.value);
        checks.push({ field: f, label: FIELD_LABELS[f], state: isMatch(c.classification) ? "match" : c.severity ? "differs" : "match", osm: ex.raw });
      }
      osm = { found: true, url: place.url, editUrl: osmEditUrl(place.url), checks };
    }
  }
  return { osm, registry: regR.status === "fulfilled" ? regR.value : null, directory: dirR.status === "fulfilled" ? dirR.value : null };
}
