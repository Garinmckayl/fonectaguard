import { normalizeAddress, normalizePhone, normalizeText, normalizeUrlHost } from "./normalize";

export interface IdentitySignals { name?: string; address?: string; phone?: string; website?: string; city?: string }
export interface IdentityMatch { score: number; verdict: "match" | "review" | "reject"; signals: string[] }

/** Deterministic identity score from independent signals; website/phone are strong, name alone is never enough. */
export function matchIdentity(canonical: IdentitySignals, observed: IdentitySignals): IdentityMatch {
  const signals: string[] = [];
  let score = 0;
  const ch = canonical.website ? normalizeUrlHost(canonical.website) : null, oh = observed.website ? normalizeUrlHost(observed.website) : null;
  if (ch && oh && ch === oh) { score += 0.35; signals.push("domain"); }
  const cp = canonical.phone ? normalizePhone(canonical.phone) : null, op = observed.phone ? normalizePhone(observed.phone) : null;
  if (cp && op && cp === op) { score += 0.25; signals.push("phone"); }
  if (canonical.name && observed.name) {
    const a = normalizeText(canonical.name), b = normalizeText(observed.name);
    if (a === b) { score += 0.25; signals.push("name"); }
    else if (a.includes(b) || b.includes(a)) { score += 0.15; signals.push("name~"); }
  }
  if (canonical.address && observed.address && normalizeAddress(canonical.address) === normalizeAddress(observed.address)) { score += 0.2; signals.push("address"); }
  else if (canonical.city && observed.address && normalizeText(observed.address).includes(normalizeText(canonical.city))) { score += 0.05; signals.push("city"); }
  score = Math.min(1, Number(score.toFixed(2)));
  const verdict = score >= 0.6 && !(signals.length === 1 && signals[0].startsWith("name")) ? "match" : score >= 0.4 ? "review" : "reject";
  return { score, verdict, signals };
}
