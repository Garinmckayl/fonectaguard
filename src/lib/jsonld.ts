import type { Schedule } from "./normalize";
import { DAYS } from "./normalize";

const SCHEMA_DAY: Record<string, string> = { mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa", sun: "Su" };

/** Weekly schedule -> schema.org openingHours strings, grouping consecutive days with the same hours ("Mo-Fr 08:00-17:00"). */
export function scheduleToSchemaOrg(s: Schedule): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < DAYS.length) {
    const h = s[DAYS[i]];
    let j = i;
    while (j + 1 < DAYS.length && s[DAYS[j + 1]] === h) j++;
    if (h && h !== "closed") out.push(`${SCHEMA_DAY[DAYS[i]]}${j > i ? `-${SCHEMA_DAY[DAYS[j]]}` : ""} ${h}`);
    i = j + 1;
  }
  return out;
}

/** A LocalBusiness JSON-LD block built from the owner-confirmed facts: the one fix that works on any website, whatever the CMS. */
export function buildJsonLd(f: { name?: string; address?: string; city?: string | null; phone?: string; hours?: unknown; website?: string; email?: string | null }): string {
  const parts = f.address?.split(",").map((x) => x.trim()) ?? [];
  const ld: Record<string, unknown> = { "@context": "https://schema.org", "@type": "LocalBusiness", name: f.name, url: f.website, telephone: f.phone };
  if (f.address) ld.address = { "@type": "PostalAddress", streetAddress: parts[0], addressLocality: f.city ?? parts[parts.length - 1] ?? undefined };
  if (f.hours && typeof f.hours === "object") ld.openingHours = scheduleToSchemaOrg(f.hours as Schedule);
  if (f.email) ld.email = f.email;
  return `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`;
}
