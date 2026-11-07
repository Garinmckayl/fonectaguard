import crypto from "crypto";

const AUTHORIZE = "https://www.openstreetmap.org/oauth2/authorize";
const TOKEN = "https://www.openstreetmap.org/oauth2/token";
export const OSM_API = "https://api.openstreetmap.org/api/0.6";
/** Least privilege: identify the account and edit the map. Nothing else is requested. */
export const OSM_SCOPE = "read_prefs write_api";

export const hasOsmOAuth = () => !!process.env.OSM_CLIENT_ID && !!process.env.OSM_CLIENT_SECRET;
export const osmRedirectUri = () => `${process.env.APP_URL ?? "http://localhost:3000"}/api/connections/osm/callback`;

const b64url = (b: Buffer) => b.toString("base64url");
export function newPkce() {
  const verifier = b64url(crypto.randomBytes(32));
  return { verifier, challenge: b64url(crypto.createHash("sha256").update(verifier).digest()), state: b64url(crypto.randomBytes(16)) };
}

export function authorizeUrl(state: string, challenge: string) {
  const q = new URLSearchParams({ response_type: "code", client_id: process.env.OSM_CLIENT_ID!, redirect_uri: osmRedirectUri(), scope: OSM_SCOPE, state, code_challenge: challenge, code_challenge_method: "S256" });
  return `${AUTHORIZE}?${q}`;
}

export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const res = await fetch(TOKEN, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: osmRedirectUri(), client_id: process.env.OSM_CLIENT_ID!, client_secret: process.env.OSM_CLIENT_SECRET!, code_verifier: verifier }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !j.access_token) throw new Error(`OpenStreetMap rejected the login${j.error ? ` (${j.error})` : ""}`);
  return j.access_token;
}

export async function fetchOsmUser(token: string): Promise<{ id: number; name: string }> {
  const res = await fetch(`${OSM_API}/user/details.json`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Could not read the OpenStreetMap account (${res.status})`);
  const j = (await res.json()) as { user?: { id: number; display_name: string } };
  if (!j.user) throw new Error("Could not read the OpenStreetMap account");
  return { id: j.user.id, name: j.user.display_name };
}

/** Signed one-time cookie value binding the OAuth state + PKCE verifier to this browser. */
export const signState = (state: string, verifier: string) => {
  const body = `${state}.${verifier}`;
  return `${body}.${crypto.createHmac("sha256", process.env.AUTH_SECRET ?? "dev-insecure-secret").update(body).digest("hex")}`;
};
export function readState(cookie: string | undefined): { state: string; verifier: string } | null {
  const [state, verifier, mac] = (cookie ?? "").split(".");
  if (!state || !verifier || !mac) return null;
  const expected = crypto.createHmac("sha256", process.env.AUTH_SECRET ?? "dev-insecure-secret").update(`${state}.${verifier}`).digest("hex");
  return mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? { state, verifier } : null;
}
