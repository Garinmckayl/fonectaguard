import crypto from "crypto";
import { fetchPage } from "./extract";

/** Deterministic per-location token; proves control of the domain when published there. */
export function verificationToken(locationId: string): string {
  const secret = process.env.AUTH_SECRET ?? "dev-insecure-secret";
  return "fg-" + crypto.createHmac("sha256", secret).update("domain-verify:" + locationId).digest("hex").slice(0, 32);
}

export interface VerifyResult { ok: boolean; method?: "dns" | "meta" | "file"; detail: string }

async function dnsHasToken(host: string, token: string): Promise<boolean> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent("_fonectaguard." + host)}&type=TXT`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { Answer?: { data: string }[] };
    return (j.Answer ?? []).some((a) => a.data.replace(/"/g, "").includes(token));
  } catch {
    return false;
  }
}

/** Checks DNS TXT, homepage meta tag, then /.well-known file for the token. */
export async function checkDomainOwnership(website: string, locationId: string): Promise<VerifyResult> {
  const token = verificationToken(locationId);
  const u = new URL(website);
  const host = u.hostname.replace(/^www\./, "");
  if (await dnsHasToken(host, token)) return { ok: true, method: "dns", detail: `Found TXT record at _fonectaguard.${host}` };
  try {
    const home = await fetchPage(`${u.origin}/`);
    if (home.ok && new RegExp(`<meta[^>]+name=["']fonectaguard-verification["'][^>]+content=["']${token}["']|<meta[^>]+content=["']${token}["'][^>]+name=["']fonectaguard-verification["']`, "i").test(home.html)) return { ok: true, method: "meta", detail: "Found verification meta tag on your homepage" };
  } catch { /* fall through */ }
  try {
    const f = await fetchPage(`${u.origin}/.well-known/fonectaguard.txt`);
    if (f.ok && f.html.includes(token)) return { ok: true, method: "file", detail: "Found /.well-known/fonectaguard.txt" };
  } catch { /* fall through */ }
  return { ok: false, detail: "Token not found yet. DNS changes can take a few minutes." };
}
