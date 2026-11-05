import { FIELD_WEIGHTS, isMatch, type Comparison } from "./compare";

export type HealthStatus = "healthy" | "attention" | "critical" | "insufficient";
export interface Health { score: number | null; status: HealthStatus; monitored: number; matching: number; sources: number }

/** Health = 100 × weighted matching fields / weighted applicable (published) monitored fields. */
export function computeHealthScore(perSource: Comparison[][]): Health {
  let total = 0, good = 0, monitored = 0, matching = 0, sources = 0, critical = false;
  for (const comps of perSource) {
    const applicable = comps.filter((c) => c.classification !== "missing");
    if (!applicable.length) continue;
    sources++;
    for (const c of applicable) {
      const w = FIELD_WEIGHTS[c.field];
      total += w; monitored++;
      if (isMatch(c.classification)) { good += w; matching++; }
      else if (c.severity === "critical") critical = true;
    }
  }
  if (!total) return { score: null, status: "insufficient", monitored: 0, matching: 0, sources: 0 };
  const score = Math.round((100 * good) / total);
  const status: HealthStatus = critical || score < 70 ? "critical" : score < 95 ? "attention" : "healthy";
  return { score, status, monitored, matching, sources };
}
