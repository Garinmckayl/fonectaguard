import { compareField, isMatch, type FieldName } from "./compare";
import { extractFromHtml, extractFromRaw, fetchPage, type Extraction } from "./extract";
import { extractBusinessFacts } from "./ai";
import { fetchTexts, hasTinyFish, webSearch } from "./tinyfish";
import { normalizeUrl } from "./normalize";
import { canWriteTo, displayName } from "./connectors";

export interface KnownSource { platform: string; url: string; observed: Partial<Record<FieldName, unknown>> }
export type CitedState = "stale" | "correct" | "no_field" | "unreadable";
export interface CheckedPage { url: string; origin: "cited" | "search"; state: CitedState }
export interface Attribution {
  field: string;
  /** Monitored sources that publish the same wrong value the assistant repeated. */
  staleIn: { platform: string; url: string; name: string; fixable: boolean }[];
  /** Monitored sources that publish the correct value (so the assistant is not reading these, or is out of date). */
  correctIn: { platform: string; url: string; name: string }[];
  pages: CheckedPage[];
  verdict: "fix_monitored" | "fix_unmonitored" | "unknown";
  advice: string;
}

const sameUrl = (a: string, b: string) => { try { return normalizeUrl(a) === normalizeUrl(b) || a.replace(/\/$/, "") === b.replace(/\/$/, ""); } catch { return a === b; } };

/** Pure: which known sources agree with the assistant's wrong value vs the verified one. */
/** Human name for a monitored source: the platform's label, or the site's hostname for generic web pages. */
export const sourceName = displayName;

export function classifyKnown(field: FieldName, stated: unknown, expected: unknown, known: KnownSource[]) {
  const staleIn: Attribution["staleIn"] = [], correctIn: Attribution["correctIn"] = [];
  for (const k of known) {
    const v = k.observed[field];
    if (v === undefined || v === null || v === "") continue;
    if (isMatch(compareField(field, expected, v).classification)) correctIn.push({ platform: k.platform, url: k.url, name: sourceName(k.platform, k.url) });
    else if (isMatch(compareField(field, stated, v).classification)) staleIn.push({ platform: k.platform, url: k.url, name: sourceName(k.platform, k.url), fixable: k.platform === "website" || canWriteTo(k.platform) });
  }
  return { staleIn, correctIn };
}

export function stateForPage(field: FieldName, stated: unknown, expected: unknown, ex: Extraction | null): CitedState {
  if (!ex) return "unreadable";
  const v = ex[field]?.value;
  if (v === undefined || v === null || v === "") return "no_field";
  if (isMatch(compareField(field, expected, v).classification)) return "correct";
  return isMatch(compareField(field, stated, v).classification) ? "stale" : "no_field";
}

export function decide(a: Omit<Attribution, "verdict" | "advice">): Pick<Attribution, "verdict" | "advice"> {
  const stalePages = a.pages.filter((p) => p.state === "stale");
  if (a.staleIn.length) {
    const names = a.staleIn.map((s) => s.name).join(", ");
    return { verdict: "fix_monitored", advice: a.staleIn.every((s) => s.fixable) ? `Correct this on ${names}: it still publishes the value the assistant repeated. Approve the proposed fix, then re-run the audit.` : `${names} still publishes the value the assistant repeated. FonectaGuard cannot edit it for you: ask the site to correct it (the exact value is in your approvals), then re-run the audit.` };
  }
  if (stalePages.length) return { verdict: "fix_unmonitored", advice: `The assistant's answer matches ${stalePages.length === 1 ? "a page" : "pages"} you don't monitor yet: ${stalePages.map((p) => new URL(p.url).hostname).join(", ")}. Update ${stalePages.length === 1 ? "it" : "them"} at the source (or claim the listing), then re-run the audit.` };
  const where = a.correctIn.length ? `Your monitored sources (${a.correctIn.map((s) => s.name).join(", ")}) are correct, so the assistant is using an older or unmonitored source.` : "None of your monitored sources explain this answer.";
  return { verdict: "unknown", advice: `${where} No readable page carrying the wrong value was found. It may come from the model's older training data; keep your own website's structured data current and re-run the audit later.` };
}

async function readPage(url: string, target: { name: string; city: string | null }): Promise<Extraction | null> {
  try {
    const p = await fetchPage(url, 8000);
    if (p.ok) { const ex = extractFromHtml(p.html, url); if (ex) return ex; }
  } catch { /* fall through to rendered read */ }
  if (!hasTinyFish()) return null;
  try {
    const text = (await fetchTexts([url])).get(url);
    if (!text) return null;
    const f = await extractBusinessFacts(text, { name: target.name, city: target.city ?? undefined, url });
    if (!f || f.is_target_business === false) return null;
    return extractFromRaw({ name: f.name ?? undefined, address: f.address ?? undefined, phone: f.phone ?? undefined, hours: f.hours ?? undefined, website: f.website ?? undefined, email: f.email ?? undefined }, url, 0.7);
  } catch {
    return null;
  }
}

/** `budget.pages` caps page reads per Worker invocation (each read costs several subrequests; Workers allow only ~50). */
export interface AttributeCtx { name: string; city: string | null; known: KnownSource[]; cache: Map<string, Promise<Extraction | null>>; budget: { pages: number } }

/** Finds which underlying sources need correcting for one wrong fact an assistant stated. */
export async function attribute(ctx: AttributeCtx, field: FieldName, stated: unknown, expected: unknown, cited: string[]): Promise<Attribution> {
  const { staleIn, correctIn } = classifyKnown(field, stated, expected, ctx.known);
  const monitored = (u: string) => ctx.known.some((k) => sameUrl(k.url, u));
  const check = async (url: string, origin: CheckedPage["origin"]): Promise<CheckedPage> => {
    if (!ctx.cache.has(url)) {
      if (ctx.budget.pages <= 0) return { url, origin, state: "unreadable" };
      ctx.budget.pages--;
      ctx.cache.set(url, readPage(url, ctx));
    }
    return { url, origin, state: stateForPage(field, stated, expected, await ctx.cache.get(url)!) };
  };
  const urls = cited.filter((u) => !monitored(u)).slice(0, 2);
  let pages = await Promise.all(urls.map((u) => check(u, "cited")));
  // Nothing explains the wrong value yet: search the web for pages that still carry it.
  if (!staleIn.length && !pages.some((p) => p.state === "stale") && hasTinyFish()) {
    try {
      const q = field === "hours" ? `${ctx.name} ${ctx.city ?? ""} opening hours` : `${ctx.name} ${ctx.city ?? ""} ${typeof stated === "string" ? stated : ""}`;
      const hits = (await webSearch(q.trim())).map((h) => h.url).filter((u) => !monitored(u) && !urls.includes(u)).slice(0, 2);
      const found = await Promise.all(hits.map((u) => check(u, "search")));
      pages = [...pages, ...found.filter((p) => p.state === "stale" || p.state === "correct")];
    } catch { /* search is best-effort */ }
  }
  const base = { field, staleIn, correctIn, pages };
  return { ...base, ...decide(base) };
}
