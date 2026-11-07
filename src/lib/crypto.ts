/** AES-GCM encryption for stored third-party tokens (WebCrypto: works on Workers and Node). Key derives from CREDENTIAL_ENCRYPTION_KEY, else AUTH_SECRET. */
async function key() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY ?? `${process.env.AUTH_SECRET ?? "dev-insecure-secret"}:credentials`;
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(plain)));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function decryptSecret(token: string): Promise<string> {
  const [iv, ct] = token.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct)));
}
