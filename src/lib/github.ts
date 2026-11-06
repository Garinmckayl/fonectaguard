import { compareField, isMatch, type FieldName } from "./compare";
import { extractFromHtml, fetchPage } from "./extract";

const API = "https://api.github.com";
const FILE = "index.html";

export const hasGithub = () => !!process.env.GITHUB_PAGES_TOKEN;

export class GithubError extends Error {}

async function gh(path: string, init: RequestInit = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { authorization: `Bearer ${process.env.GITHUB_PAGES_TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "FonectaGuard", ...(init.headers ?? {}) },
  });
  return res;
}

/** Confirms the token can write to the repo and returns the public Pages URL it serves. */
export async function inspectRepo(repo: string): Promise<{ pagesUrl: string; branch: string }> {
  if (!hasGithub()) throw new GithubError("GitHub connector is not configured on this server");
  const r = await gh(`/repos/${repo}`);
  if (r.status === 404 || r.status === 403) throw new GithubError("FonectaGuard's token has no access to that repository");
  if (!r.ok) throw new GithubError(`GitHub returned ${r.status}`);
  const meta = (await r.json()) as { permissions?: { push?: boolean }; default_branch: string };
  if (!meta.permissions?.push) throw new GithubError("Token is read-only for that repository (needs Contents: write)");
  const p = await gh(`/repos/${repo}/pages`);
  if (!p.ok) throw new GithubError("GitHub Pages is not enabled for that repository");
  const pages = (await p.json()) as { html_url: string };
  return { pagesUrl: pages.html_url, branch: meta.default_branch };
}

async function readFile(repo: string) {
  const r = await gh(`/repos/${repo}/contents/${FILE}`);
  if (!r.ok) throw new GithubError(`Could not read ${FILE} (${r.status})`);
  const j = (await r.json()) as { content: string; sha: string };
  return { html: Buffer.from(j.content, "base64").toString("utf8"), sha: j.sha };
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const JSONLD_KEY: Partial<Record<FieldName, string>> = { name: "name", phone: "telephone", address: "address", website: "url", email: "email", description: "description" };
const VISIBLE_ID: Partial<Record<FieldName, string>> = { address: "addr", phone: "phone", hours: "hours" };

/** Rewrites one field in the page's JSON-LD block (and the matching visible element, if present). */
export function updateHtml(html: string, field: FieldName, value: string): string | null {
  let done = false;
  let out = html.replace(/(<script[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/i, (all, open, body, close) => {
    try {
      const j = JSON.parse(body);
      if (field === "hours") j.openingHours = [value];
      else if (JSONLD_KEY[field]) j[JSONLD_KEY[field]!] = value;
      else return all;
      done = true;
      return `${open}\n${JSON.stringify(j, null, 2)}\n${close}`;
    } catch {
      return all;
    }
  });
  if (!done) return null;
  const id = VISIBLE_ID[field];
  if (id) out = out.replace(new RegExp(`(<[a-z]+[^>]*id=["']${id}["'][^>]*>)[^<]*(</)`, "i"), (_m, a, b) => `${a}${escHtml(value)}${b}`);
  return out;
}

export async function writeField(repo: string, field: FieldName, value: string, message?: string) {
  const { html, sha } = await readFile(repo);
  const next = updateHtml(html, field, value);
  if (next === null) return { ok: false, response: { error: `Could not update ${field} in ${FILE} (no JSON-LD block or unsupported field)` } };
  if (next === html) return { ok: true, response: { unchanged: true } };
  const r = await gh(`/repos/${repo}/contents/${FILE}`, {
    method: "PUT",
    body: JSON.stringify({ message: message ?? `FonectaGuard: update ${field}`, content: Buffer.from(next, "utf8").toString("base64"), sha, committer: { name: "FonectaGuard", email: "fonectaguard@arcumet.com" } }),
  });
  if (!r.ok) return { ok: false, response: { error: `GitHub rejected the commit (${r.status})`, detail: (await r.text()).slice(0, 300) } };
  const j = (await r.json()) as { commit: { sha: string; html_url: string } };
  return { ok: true, response: { commit: j.commit.sha, commitUrl: j.commit.html_url, field, value } };
}

/** Polls the public page until GitHub Pages has deployed the new value. */
export async function awaitPublished(url: string, field: FieldName, value: string, timeoutMs = 100_000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const sep = url.includes("?") ? "&" : "?";
      const page = await fetchPage(`${url}${sep}fg=${Date.now()}`);
      const ex = page.ok ? extractFromHtml(page.html, url) : null;
      if (ex?.[field] && isMatch(compareField(field, value, ex[field]!.raw).classification)) return true;
    } catch {
      /* keep polling */
    }
  }
  return false;
}

export function sameSite(pagesUrl: string, website: string): boolean {
  try {
    const a = new URL(pagesUrl), b = new URL(website);
    const host = (u: URL) => u.hostname.replace(/^www\./, "").toLowerCase();
    const path = (u: URL) => u.pathname.replace(/\/+$/, "");
    return host(a) === host(b) && path(b).startsWith(path(a));
  } catch {
    return false;
  }
}
