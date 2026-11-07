import { compareField, isMatch } from "./compare";
import { normalizeText, normalizeUrlHost } from "./normalize";

export interface RegistryHit {
  businessId: string; legalName: string; tradeNames: string[]; active: boolean;
  address?: string; website?: string; url: string;
  websiteMatches: boolean; /** The registered office is the legal address; it legitimately differs from an outlet's address for multi-location companies. */
  addressCheck: "match" | "differs" | "unknown";
}

type Company = {
  businessId: { value: string }; names?: { name: string; type?: string; endDate?: string }[]; endDate?: string; tradeRegisterStatus?: string;
  website?: { url?: string }; addresses?: { type?: number; street?: string; buildingNumber?: string; postCode?: string; postOffices?: { city: string; languageCode: string }[] }[];
};

/** Finnish Trade Register (PRH open data, no key): confirms the registered company behind a business and its official address. */
export async function lookupRegistry(who: { name: string; city?: string | null; website?: string | null; address?: string | null }): Promise<RegistryHit | null> {
  const q = new URLSearchParams({ name: who.name });
  if (who.city) q.set("location", who.city);
  const res = await fetch(`https://avoindata.prh.fi/opendata-ytj-api/v3/companies?${q}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const j = (await res.json()) as { companies?: Company[] };
  const host = who.website ? normalizeUrlHost(who.website) : null;
  const want = normalizeText(who.name);
  const live = (j.companies ?? []).filter((c) => !c.endDate);
  const siteMatch = (c: Company) => !!host && !!c.website?.url && normalizeUrlHost(c.website.url) === host;
  const exactName = (c: Company) => (c.names ?? []).some((n) => !n.endDate && normalizeText(n.name) === want);
  // Identity: the registered website equals ours, or exactly one company carries exactly this trade name. Anything ambiguous is not a match.
  const bySite = live.filter(siteMatch);
  const byName = live.filter(exactName);
  const pick = bySite.length === 1 ? bySite[0] : bySite.length === 0 && byName.length === 1 ? byName[0] : null;
  const best = pick ? { c: pick } : null;
  if (!best) return null;
  const c = best.c;
  const street = c.addresses?.find((a) => a.type === 1) ?? c.addresses?.[0];
  const city = street?.postOffices?.find((p) => p.languageCode === "1")?.city;
  const address = street?.street ? `${street.street} ${street.buildingNumber ?? ""}, ${city ?? ""}`.replace(/\s+,/, ",").trim() : undefined;
  const addressCheck = !address || !who.address ? "unknown" : isMatch(compareField("address", who.address, address.replace(/, *$/, "")).classification) ? "match" : "differs";
  const current = (c.names ?? []).filter((n) => !n.endDate);
  return {
    businessId: c.businessId.value, legalName: current.find((n) => n.type === "1")?.name ?? current[0]?.name ?? who.name,
    tradeNames: current.filter((n) => n.type !== "1").map((n) => n.name).slice(0, 4), active: true,
    address, website: c.website?.url, url: `https://tietopalvelu.ytj.fi/yritys/${c.businessId.value}`,
    websiteMatches: !!host && !!c.website?.url && normalizeUrlHost(c.website.url) === host, addressCheck,
  };
}
