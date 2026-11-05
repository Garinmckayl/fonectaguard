import { DAYS, closingMinutes, normalizeAddress, normalizePhone, normalizeText, normalizeUrl, parseHours, type Schedule } from "./normalize";

export type FieldName = "name" | "address" | "phone" | "email" | "website" | "hours" | "description";
export type Classification = "exact" | "equivalent" | "harmless" | "missing" | "likely" | "ambiguous";
export type Severity = "critical" | "high" | "medium" | "low";

export const FIELD_WEIGHTS: Record<FieldName, number> = { address: 3, phone: 3, hours: 3, website: 2, name: 2, email: 2, description: 1 };
export const FIELD_LABELS: Record<FieldName, string> = { name: "Business name", address: "Address", phone: "Phone number", email: "Email", website: "Website", hours: "Opening hours", description: "Description" };

export interface Comparison {
  field: FieldName;
  classification: Classification;
  severity: Severity | null;
  canonical: unknown;
  observed: unknown;
  explanation: string;
  impact: string;
}

const IMPACT: Record<FieldName, string> = {
  address: "Customers may navigate to the wrong place or believe you have moved.",
  phone: "Customers may be unable to reach you, or reach someone else.",
  hours: "Customers may believe you are closed when you are open (or the reverse).",
  website: "Customers may be sent to the wrong or an outdated website.",
  name: "Customers may not recognise your business in search results.",
  email: "Messages from customers may not arrive.",
  description: "Minor; wording differences rarely affect customers.",
};

function result(field: FieldName, classification: Classification, severity: Severity | null, canonical: unknown, observed: unknown, explanation: string): Comparison {
  return { field, classification, severity, canonical, observed, explanation, impact: classification === "likely" || classification === "ambiguous" ? IMPACT[field] : "" };
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean)), tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/** Deterministic comparison. `observed` undefined/empty => "missing" (never treated as incorrect). */
export function compareField(field: FieldName, canonical: unknown, observed: unknown): Comparison {
  if (observed === undefined || observed === null || observed === "") return result(field, "missing", null, canonical, observed, `${FIELD_LABELS[field]} is not published on this source.`);
  const c = String(canonical), o = String(observed);
  switch (field) {
    case "phone": {
      const nc = normalizePhone(c), no = normalizePhone(o);
      if (!no) return result(field, "ambiguous", "low", c, o, `Observed phone "${o}" could not be normalised.`);
      if (nc === no) return result(field, c === o ? "exact" : "equivalent", null, c, o, "Phone numbers match.");
      return result(field, "likely", "high", nc ?? c, no, `Published phone ${no} differs from verified phone ${nc ?? c}.`);
    }
    case "address": {
      if (c === o) return result(field, "exact", null, c, o, "Addresses match.");
      const nc = normalizeAddress(c), no = normalizeAddress(o);
      if (nc === no) return result(field, "equivalent", null, c, o, "Addresses match after formatting normalisation.");
      // Directories often omit the postcode/country; treat as the same address when one side's tokens are all in the other.
      const toks = (a: string) => a.split(" ").filter((t) => t && !/^\d{5}$/.test(t) && !["finland", "suomi", "fi"].includes(t));
      const tc = toks(nc), to = toks(no), [small, big] = tc.length <= to.length ? [tc, to] : [to, tc];
      if (small.length >= 2 && small.every((t) => big.includes(t)) && small.some((t) => /\d/.test(t))) return result(field, "equivalent", null, c, o, "Addresses match (postcode/country omitted).");
      return result(field, "likely", "critical", c, o, `Published address "${o}" differs from verified address "${c}". It may be an outdated location.`);
    }
    case "website": {
      const nc = normalizeUrl(c), no = normalizeUrl(o);
      if (nc && nc === no) return result(field, c === o ? "exact" : "equivalent", null, c, o, "Websites match.");
      return result(field, "likely", "medium", c, o, `Published website ${o} differs from ${c}.`);
    }
    case "email": {
      if (c.toLowerCase() === o.toLowerCase()) return result(field, c === o ? "exact" : "equivalent", null, c, o, "Emails match.");
      return result(field, "likely", "medium", c, o, `Published email ${o} differs from ${c}.`);
    }
    case "name": {
      if (c === o) return result(field, "exact", null, c, o, "Names match.");
      const nc = normalizeText(c), no = normalizeText(o);
      if (nc === no || nc.replace(/ /g, "") === no.replace(/ /g, "")) return result(field, "equivalent", null, c, o, "Names match after normalisation.");
      if (tokenSimilarity(nc, no) >= 0.6 || no.includes(nc) || nc.includes(no)) return result(field, "harmless", null, c, o, "Name differs slightly (e.g. suffix or descriptor).");
      return result(field, "likely", "medium", c, o, `Published name "${o}" differs from "${c}".`);
    }
    case "description": {
      const sim = tokenSimilarity(normalizeText(c), normalizeText(o));
      return result(field, sim >= 0.999 ? "equivalent" : "harmless", null, c, o, sim >= 0.999 ? "Descriptions match." : "Description wording differs; usually harmless.");
    }
    case "hours": {
      const sc = (typeof canonical === "object" ? canonical : parseHours(c)) as Schedule | null;
      const so = (typeof observed === "object" ? observed : parseHours(o)) as Schedule | null;
      if (!sc) return result(field, "ambiguous", "low", canonical, observed, "Canonical hours are not structured.");
      if (!so) return result(field, "ambiguous", "low", canonical, observed, `Observed hours "${o}" could not be parsed.`);
      const diffs = DAYS.filter((d) => sc[d] !== so[d]);
      if (!diffs.length) return result(field, "equivalent", null, canonical, observed, "Weekly schedules match.");
      let worst = 0;
      for (const d of diffs) {
        const a = closingMinutes(sc[d]), b = closingMinutes(so[d]);
        worst = Math.max(worst, a !== null && b !== null ? Math.abs(a - b) : 24 * 60);
      }
      const sev: Severity = worst >= 60 ? "high" : "medium";
      const d0 = diffs[0];
      return result(field, "likely", sev, canonical, observed, `Hours differ on ${diffs.length} day(s); e.g. ${d0}: published ${so[d0]} vs verified ${sc[d0]}.`);
    }
  }
}

export const isMatch = (c: Classification) => c === "exact" || c === "equivalent" || c === "harmless";

export function compareAll(canonical: Partial<Record<FieldName, unknown>>, observed: Partial<Record<FieldName, unknown>>): Comparison[] {
  const out: Comparison[] = [];
  for (const field of Object.keys(canonical) as FieldName[]) {
    if (canonical[field] === undefined) continue;
    out.push(compareField(field, canonical[field], observed[field]));
  }
  return out;
}
