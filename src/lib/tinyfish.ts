export interface SearchHit { title: string; url: string; snippet: string; site: string }

function key() {
  const k = process.env.TINYFISH_API_KEY;
  if (!k) throw new Error("TINYFISH_API_KEY is not configured");
  return k;
}

export const hasTinyFish = () => !!process.env.TINYFISH_API_KEY && !!process.env.OPENROUTER_API_KEY;

/** TinyFish Search: real web results for a query. */
export async function webSearch(query: string): Promise<SearchHit[]> {
  const res = await fetch(`https://api.search.tinyfish.ai/?query=${encodeURIComponent(query)}`, { headers: { "x-api-key": key() }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`TinyFish search ${res.status}`);
  const j = (await res.json()) as { results?: { title?: string; url?: string; snippet?: string; site_name?: string }[] };
  return (j.results ?? []).filter((r) => r.url).map((r) => ({ title: r.title ?? "", url: r.url!, snippet: r.snippet ?? "", site: r.site_name ?? new URL(r.url!).hostname }));
}

function htmlToText(h: string): string {
  return h.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/** Plain HTTP read of a page, as a safety net for sites whose rendered "main content" omits contact details (footers, cookie-gated pages). */
async function directText(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; FonectaGuardBot/1.0)" }, redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return "";
    return htmlToText((await r.text()).slice(0, 600_000)).slice(0, 7000);
  } catch {
    return "";
  }
}

/** TinyFish Fetch (rendered markdown) merged with a plain read. Returns a map url → text for pages that loaded. */
export async function fetchTexts(urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!urls.length) return out;
  const batch = urls.slice(0, 10);
  const [tf, direct] = await Promise.all([
    fetch("https://api.fetch.tinyfish.ai", {
      method: "POST", headers: { "x-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify({ urls: batch, format: "markdown", purpose: "Extract business contact details (name, address, phone, opening hours) to verify listing accuracy" }), signal: AbortSignal.timeout(45_000),
    }).then(async (res) => (res.ok ? ((await res.json()) as { results?: { url: string; text?: string }[] }).results ?? [] : [])).catch(() => []),
    Promise.all(batch.map(async (u) => [u, await directText(u)] as const)),
  ]);
  const d = new Map(direct);
  for (const u of batch) {
    const t = tf.find((r) => r.url === u)?.text ?? "";
    const merged = [t.slice(0, 6000), d.get(u) ? `\n--- page text ---\n${d.get(u)}` : ""].join("").trim();
    if (merged) out.set(u, merged);
  }
  return out;
}
