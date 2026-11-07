import crypto from "crypto";
import { extractFromRaw, type Extraction } from "./extract";
import { parseHours, DAYS, type Schedule } from "./normalize";
import type { FieldName } from "./compare";

const DEFAULT_VERSION = "v24.0";
const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? DEFAULT_VERSION}`;
/** Only what editing Page info needs. */
/** business_management is only used to list Pages that are owned through a Business portfolio. */
export const FB_SCOPE = "pages_show_list,pages_read_engagement,pages_manage_metadata,business_management";
/** Phone, hours and website have clean Page fields. Names and addresses are left to people. */
export const FB_WRITABLE: FieldName[] = ["phone", "hours", "website"];

export const hasFacebook = () => !!process.env.META_APP_ID && !!process.env.META_APP_SECRET;
export const fbRedirectUri = () => `${process.env.APP_URL ?? "http://localhost:3000"}/api/connections/facebook/callback`;

/** Meta can require every server call to carry HMAC(token, app secret); sending it is always safe. */
export const appSecretProof = (token: string) => crypto.createHmac("sha256", process.env.META_APP_SECRET ?? "").update(token).digest("hex");

export const newState = () => crypto.randomBytes(16).toString("base64url");
const mac = (v: string) => crypto.createHmac("sha256", process.env.AUTH_SECRET ?? "dev-insecure-secret").update(v).digest("hex");
export const signFbState = (state: string) => `${state}.${mac(state)}`;
export function readFbState(cookie: string | undefined): string | null {
  const [state, m] = (cookie ?? "").split(".");
  if (!state || !m) return null;
  const expected = mac(state);
  return m.length === expected.length && crypto.timingSafeEqual(Buffer.from(m), Buffer.from(expected)) ? state : null;
}

/** Facebook Login for Business apps ignore `scope` and use a saved Configuration (META_LOGIN_CONFIG_ID) that lists the permissions; classic Facebook Login uses `scope`. */
export function authorizeUrl(state: string) {
  const base: Record<string, string> = { client_id: process.env.META_APP_ID!, redirect_uri: fbRedirectUri(), state, response_type: "code" };
  const q = process.env.META_LOGIN_CONFIG_ID ? { ...base, config_id: process.env.META_LOGIN_CONFIG_ID, override_default_response_type: "true" } : { ...base, scope: FB_SCOPE };
  return `https://www.facebook.com/${process.env.META_GRAPH_VERSION ?? DEFAULT_VERSION}/dialog/oauth?${new URLSearchParams(q)}`;
}

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH()}${path}`, { ...init, signal: AbortSignal.timeout(12_000) });
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || j.error) throw new Error(j.error?.message ?? `Facebook returned ${res.status}`);
  return j;
}

/** Code -> short-lived user token -> long-lived user token (so the Page tokens derived from it do not expire). */
export async function exchangeCode(code: string): Promise<string> {
  const base = { client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET! };
  const short = await graph<{ access_token: string }>(`/oauth/access_token?${new URLSearchParams({ ...base, redirect_uri: fbRedirectUri(), code })}`);
  const long = await graph<{ access_token: string }>(`/oauth/access_token?${new URLSearchParams({ ...base, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token })}`);
  return long.access_token;
}

export interface FbPageRef { id: string; name: string; token: string }
/** Pages the user can manage (full control needed to edit info), each with its own Page token. */
type RawPage = { id: string; name: string; access_token?: string; tasks?: string[] };
export async function listManagedPages(userToken: string): Promise<FbPageRef[]> {
  const auth = { access_token: userToken, appsecret_proof: appSecretProof(userToken) };
  const fields = "id,name,access_token,tasks";
  const found = new Map<string, RawPage>();
  const add = (rows?: RawPage[]) => (rows ?? []).forEach((p) => { if (p.access_token && (!p.tasks || p.tasks.includes("MANAGE")) && !found.has(p.id)) found.set(p.id, p); });
  add((await graph<{ data?: RawPage[] }>(`/me/accounts?${new URLSearchParams({ fields, limit: "50", ...auth })}`)).data);
  // Pages owned through a Business portfolio are not in /me/accounts; they are reached through the business (needs business_management).
  if (!found.size) {
    const biz = await graph<{ data?: { id: string }[] }>(`/me/businesses?${new URLSearchParams({ fields: "id,name", limit: "20", ...auth })}`).catch(() => null);
    for (const b of biz?.data ?? []) {
      for (const edge of ["owned_pages", "client_pages"]) add((await graph<{ data?: RawPage[] }>(`/${b.id}/${edge}?${new URLSearchParams({ fields, limit: "50", ...auth })}`).catch(() => null))?.data);
    }
  }
  return [...found.values()].map((p) => ({ id: p.id, name: p.name, token: p.access_token! }));
}

/** Plain-language account of what Facebook granted and returned, shown when no manageable Page is found so the owner can see why. */
export async function diagnoseAccount(userToken: string): Promise<string> {
  const auth = { access_token: userToken, appsecret_proof: appSecretProof(userToken) };
  const perms = await graph<{ data?: { permission: string; status: string }[] }>(`/me/permissions?${new URLSearchParams(auth)}`).catch(() => null);
  const accts = await graph<{ data?: { name: string; tasks?: string[]; access_token?: string }[] }>(`/me/accounts?${new URLSearchParams({ fields: "name,tasks,access_token", limit: "50", ...auth })}`).catch(() => null);
  // Which Pages the user actually shared in the consent step (granular scopes), straight from Meta's token debugger.
  const dbg = await graph<{ data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>(`/debug_token?${new URLSearchParams({ input_token: userToken, access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}` })}`).catch(() => null);
  const shared = (dbg?.data?.granular_scopes ?? []).filter((g) => /^pages_/.test(g.scope)).map((g) => `${g.scope}=${g.target_ids?.length ?? 0} Page(s) shared`);
  const granted = (perms?.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
  const declined = (perms?.data ?? []).filter((p) => p.status !== "granted").map((p) => p.permission);
  const pages = (accts?.data ?? []).map((p) => `${p.name} [${p.access_token ? "token" : "no token"}; ${(p.tasks ?? ["no task info"]).join("/")}]`);
  return `${shared.length ? `shared in consent: ${shared.join(", ")}. ` : "no Page was shared in the consent step. "}granted: ${granted.join(", ") || "none"}${declined.length ? `; declined: ${declined.join(", ")}` : ""}. Facebook listed ${pages.length} Page(s)${pages.length ? `: ${pages.join(" | ")}` : ""}.`;
}

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Page `hours` ({"mon_1_open":"08:00","mon_1_close":"17:00",...}) -> text our parser reads. Days without a slot are closed. */
export function fbHoursToText(h: Record<string, string> | undefined): string | undefined {
  if (!h || !Object.keys(h).length) return undefined;
  return DAY_KEYS.map((d) => (h[`${d}_1_open`] && h[`${d}_1_close`] ? `${d} ${h[`${d}_1_open`]}-${h[`${d}_1_close`]}` : `${d} closed`)).join("; ");
}

/** Weekly text -> Page `hours` dictionary. Null if it cannot be parsed. Closed days are simply omitted. */
export function textToFbHours(value: string): Record<string, string> | null {
  const s = parseHours(value) as Schedule | null;
  if (!s) return null;
  const out: Record<string, string> = {};
  DAYS.forEach((d) => { const m = s[d].match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/); if (m) { out[`${d}_1_open`] = m[1]; out[`${d}_1_close`] = m[2]; } });
  return Object.keys(out).length ? out : null;
}

const FIELDS = "id,name,phone,website,hours,link,single_line_address,emails";

/** Reads the Page as the owner sees it, as the same extraction shape every other source produces. */
export async function readFacebookPage(pageId: string, token: string): Promise<Extraction | null> {
  const p = await graph<{ id: string; name?: string; phone?: string; website?: string; hours?: Record<string, string>; link?: string; single_line_address?: string; emails?: string[] }>(`/${pageId}?${new URLSearchParams({ fields: FIELDS, access_token: token, appsecret_proof: appSecretProof(token) })}`).catch(() => null);
  if (!p) return null;
  return extractFromRaw({ name: p.name, phone: p.phone, website: p.website, hours: fbHoursToText(p.hours), address: p.single_line_address, email: p.emails?.[0] }, p.link ?? `https://www.facebook.com/${pageId}`, 0.95);
}

/** One approved edit to the Page. The caller re-reads afterwards to verify. */
export async function writeFacebookField(pageId: string, token: string, field: FieldName, value: string): Promise<{ ok: boolean; response: Record<string, unknown> }> {
  const body = new URLSearchParams({ access_token: token, appsecret_proof: appSecretProof(token) });
  if (field === "phone") body.set("phone", value);
  else if (field === "website") body.set("website", value);
  else if (field === "hours") {
    const h = textToFbHours(value);
    if (!h) return { ok: false, response: { error: `Cannot express opening hours "${value}" for a Facebook Page` } };
    body.set("hours", JSON.stringify(h));
  } else return { ok: false, response: { error: `${field} is not edited on Facebook Pages by FonectaGuard` } };
  try {
    const r = await graph<{ success?: boolean }>(`/${pageId}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    return { ok: r.success !== false, response: { page: pageId, field, value } };
  } catch (e) {
    return { ok: false, response: { error: e instanceof Error ? e.message : "Facebook rejected the edit" } };
  }
}
